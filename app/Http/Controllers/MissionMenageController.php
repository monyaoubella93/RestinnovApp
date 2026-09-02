<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesMissionAccess;
use App\Http\Controllers\Concerns\HasFriendlyUploadMessages;
use App\Models\MissionMenage;
use App\Models\MissionMenagePhotoPreuve;
use App\Models\ProduitMenageCatalogue;
use App\Models\ProduitMenageSignale;
use App\Models\TicketMaintenance;
use App\Models\TicketMaintenancePhoto;
use App\Models\Utilisateur;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class MissionMenageController extends Controller
{
    use AuthorizesMissionAccess;
    use HasFriendlyUploadMessages;

    private const DETAIL_RELATIONS = ['sejour.appartement', 'agent', 'produits', 'checklistItems', 'produitsSignales', 'refus', 'photosPreuve'];

    /**
     * "Mes missions du jour": missions assigned to a given menage agent
     * still relevant to their day -- a_faire/en_cours (not yet started or
     * in progress), en_attente_validation (their part is done, waiting on
     * the Manager), and non_conforme (the Manager sent it back). Only
     * "conforme" missions leave this list, since those are done and move
     * on to the agent's historique instead.
     *
     * A "menage" caller always gets their own missions, regardless of what
     * agent_id (if any) they pass -- there is no legitimate reason for one
     * agent to list another's missions. Only "manager" may query by an
     * arbitrary agent_id.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role === Utilisateur::ROLE_MENAGE) {
            $agentId = $user->id;
        } else {
            $validated = $request->validate([
                'agent_id' => ['required', 'integer', 'exists:utilisateurs,id'],
            ]);
            $agentId = $validated['agent_id'];
        }

        $missions = MissionMenage::with(self::DETAIL_RELATIONS)
            ->where('agent_id', $agentId)
            ->whereIn('statut', [
                MissionMenage::STATUT_A_FAIRE,
                MissionMenage::STATUT_EN_COURS,
                MissionMenage::STATUT_EN_ATTENTE_VALIDATION,
                MissionMenage::STATUT_NON_CONFORME,
            ])
            ->latest()
            ->get();

        return response()->json($missions);
    }

    /**
     * Chronological history of this menage agent's own already-validated
     * (conforme) missions -- appartement nom/adresse plus the sejour date,
     * for a simple past-work log. Explicitly own-agent-only server-side,
     * same as index(): a "menage" caller can never pass another agent's id.
     */
    public function historique(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role === Utilisateur::ROLE_MENAGE) {
            $agentId = $user->id;
        } else {
            $validated = $request->validate([
                'agent_id' => ['required', 'integer', 'exists:utilisateurs,id'],
            ]);
            $agentId = $validated['agent_id'];
        }

        $missions = MissionMenage::with(['sejour.appartement', 'produits', 'checklistItems'])
            ->where('agent_id', $agentId)
            ->where('statut', MissionMenage::STATUT_CONFORME)
            ->get()
            ->sortByDesc(fn (MissionMenage $mission) => $mission->sejour->date_depart)
            ->values();

        return response()->json($missions->map(fn (MissionMenage $mission) => [
            'id' => $mission->id,
            'sejour' => [
                'id' => $mission->sejour->id,
                'reference' => $mission->sejour->reference,
                'date_arrivee' => $mission->sejour->date_arrivee->toDateString(),
                'date_depart' => $mission->sejour->date_depart->toDateString(),
                'nom_voyageur' => $mission->sejour->nom_voyageur,
            ],
            'appartement' => $mission->sejour->appartement ? [
                'id' => $mission->sejour->appartement->id,
                'nom' => $mission->sejour->appartement->nom,
                'adresse' => $mission->sejour->appartement->adresse,
            ] : null,
            'checklist_modeles_utilises' => $mission->checklistItems
                ->pluck('checklist_modele_nom')
                ->filter()
                ->unique()
                ->values(),
            'checklist_items' => $mission->checklistItems->map(fn ($item) => [
                'libelle' => $item->libelle,
                'checklist_modele_nom' => $item->checklist_modele_nom,
                'coche' => $item->coche,
                'photo_url' => $item->photo_url,
                'photo_reference_url' => $item->photo_reference_url,
            ])->values(),
            'produits' => $mission->produitsDetail(),
        ]));
    }

    /**
     * Manager-wide "Historique" view -- every already-validated (conforme)
     * mission across every appartement, most recent sejour first, optionally
     * narrowed to one appartement and/or a sejour checkout date range.
     * Distinct from historique() above, which is scoped to a single agent's
     * own missions and has no filters.
     */
    public function historiqueManager(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'appartement_id' => ['sometimes', 'integer', 'exists:appartements,id'],
            'date_debut' => ['sometimes', 'date'],
            'date_fin' => ['sometimes', 'date'],
        ]);

        $missions = MissionMenage::with(['sejour.appartement', 'produits', 'checklistItems'])
            ->where('statut', MissionMenage::STATUT_CONFORME)
            ->whereHas('sejour', function ($query) use ($validated) {
                if (! empty($validated['appartement_id'])) {
                    $query->where('appartement_id', $validated['appartement_id']);
                }
                if (! empty($validated['date_debut'])) {
                    $query->whereDate('date_depart', '>=', $validated['date_debut']);
                }
                if (! empty($validated['date_fin'])) {
                    $query->whereDate('date_depart', '<=', $validated['date_fin']);
                }
            })
            ->get()
            ->sortByDesc(fn (MissionMenage $mission) => $mission->sejour->date_depart)
            ->values();

        return response()->json($missions->map(function (MissionMenage $mission) {
            $fraisForfait = (float) $mission->frais_forfait;
            $fraisProduitsTotal = $mission->fraisProduitsTotal();

            return [
                'id' => $mission->id,
                'sejour' => [
                    'id' => $mission->sejour->id,
                    'reference' => $mission->sejour->reference,
                    'date_arrivee' => $mission->sejour->date_arrivee->toDateString(),
                    'date_depart' => $mission->sejour->date_depart->toDateString(),
                    'nom_voyageur' => $mission->sejour->nom_voyageur,
                ],
                'appartement' => $mission->sejour->appartement ? [
                    'id' => $mission->sejour->appartement->id,
                    'nom' => $mission->sejour->appartement->nom,
                    'adresse' => $mission->sejour->appartement->adresse,
                ] : null,
                'checklist_modeles_utilises' => $mission->checklistItems
                    ->pluck('checklist_modele_nom')
                    ->filter()
                    ->unique()
                    ->values(),
                'checklist_items' => $mission->checklistItems->map(fn ($item) => [
                    'libelle' => $item->libelle,
                    'checklist_modele_nom' => $item->checklist_modele_nom,
                    'coche' => $item->coche,
                    'photo_url' => $item->photo_url,
                    'photo_reference_url' => $item->photo_reference_url,
                ])->values(),
                'produits' => $mission->produitsDetail(),
                'frais_forfait' => round($fraisForfait, 2),
                'frais_produits_total' => round($fraisProduitsTotal, 2),
                'frais_total' => round($fraisForfait + $fraisProduitsTotal, 2),
            ];
        })->values());
    }

    /**
     * Manager-wide "Ménage à valider" queue -- every mission currently
     * waiting on the Manager's decision (en_attente_validation), across
     * every agent and appartement, with the full checklist/produits/photos
     * detail already eager-loaded so MissionValidationDetail can render
     * without a second request. A mission leaves this list the moment it
     * is validated (moves to historiqueManager()) or refused (moves back to
     * the agent, statut non_conforme).
     */
    public function aValider(): JsonResponse
    {
        $missions = MissionMenage::with(self::DETAIL_RELATIONS)
            ->where('statut', MissionMenage::STATUT_EN_ATTENTE_VALIDATION)
            ->latest()
            ->latest('id')
            ->get();

        return response()->json($missions);
    }

    /**
     * Full detail of a single mission, including its checklist.
     */
    public function show(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        return response()->json($missionMenage->load(self::DETAIL_RELATIONS));
    }

    /**
     * The agent opening a mission's detail: dismisses its "Nouveau" badge
     * (vue -> true). Idempotent. Does NOT advance the statut -- moving a
     * mission out of "a_faire" requires the mandatory "photo avant ménage",
     * see commencer().
     */
    public function ouvrir(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        if (! $missionMenage->vue) {
            $missionMenage->update(['vue' => true]);
        }

        return response()->json($missionMenage->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * The agent actually starting the job: requires a "photo avant ménage"
     * documenting the apartment's state before any work is done, then moves
     * the mission a_faire -> en_cours. This is the only way out of
     * "a_faire" -- terminer() refuses anything still in that statut, so
     * there is no way to reach en_attente_validation without first
     * attaching this photo.
     */
    public function commencer(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        if ($missionMenage->statut !== MissionMenage::STATUT_A_FAIRE) {
            return response()->json([
                'message' => 'Cette mission a déjà été commencée.',
            ], 422);
        }

        $validated = $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png', 'max:10240'],
        ], $this->uploadValidationMessages());

        MissionMenagePhotoPreuve::create([
            'mission_menage_id' => $missionMenage->id,
            'photo_url' => $validated['photo']->store('missions-menage-photos-preuve', 'public'),
            'type' => MissionMenagePhotoPreuve::TYPE_AVANT,
        ]);

        $missionMenage->update(['statut' => MissionMenage::STATUT_EN_COURS, 'vue' => true]);

        return response()->json($missionMenage->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Marks a mission "en_attente_validation" once its whole checklist is
     * checked off -- the agent's part of the job is done, but the
     * appartement only becomes "disponible" again once a manager reviews
     * and validates it (see valider()). A mission with no checklist items
     * at all (no checklist_modele was assigned to the appartement) has
     * nothing to block on, so it can always be marked terminee.
     *
     * Also requires at least one "photo après ménage" (a photo_preuve of
     * type "apres", attached via ajouterPhotosPreuve()) -- the agent's
     * evidence of the finished work, shown side by side with the "avant"
     * photo on the Manager's validation screen. Refusing a mission still
     * in "a_faire" (i.e. commencer() was never called) is implied by this
     * same check, since a mission can only reach "en_cours" or
     * "non_conforme" through commencer()/refuser().
     */
    public function terminer(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        if ($missionMenage->statut === MissionMenage::STATUT_A_FAIRE) {
            return response()->json([
                'message' => 'La photo avant ménage doit être prise avant de commencer cette mission.',
            ], 422);
        }

        $resteACocher = $missionMenage->checklistItems()->where('coche', false)->exists();

        if ($resteACocher) {
            return response()->json([
                'message' => 'Tous les éléments de la checklist doivent être cochés avant de marquer la mission terminée.',
            ], 422);
        }

        $aUnePhotoApres = $missionMenage->photosPreuve()->where('type', MissionMenagePhotoPreuve::TYPE_APRES)->exists();

        if (! $aUnePhotoApres) {
            return response()->json([
                'message' => 'Une photo après ménage est requise avant de marquer la mission terminée.',
            ], 422);
        }

        $missionMenage->update(['statut' => MissionMenage::STATUT_EN_ATTENTE_VALIDATION]);

        return response()->json($missionMenage->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Manager-only: validates a mission the agent has finished, moving it
     * from "en_attente_validation" to "conforme". This is the precise
     * moment the appartement flips back to "disponible" (its statut is
     * derived live from mission_menage statuts, see
     * Appartement::statutCalcule()).
     */
    public function valider(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        if ($missionMenage->statut !== MissionMenage::STATUT_EN_ATTENTE_VALIDATION) {
            return response()->json([
                'message' => 'Cette mission n\'est pas en attente de validation.',
            ], 422);
        }

        $missionMenage->update(['statut' => MissionMenage::STATUT_CONFORME]);

        return response()->json($missionMenage->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Manager-only: rejects a mission the agent has finished, with a motif
     * that can be text, audio, and/or photo (at least one required) --
     * same richness as TicketMaintenanceController::refuserResolution().
     * The mission goes back to "non_conforme" (not closed) -- same agent,
     * still blocking the appartement -- and every refusal is kept even
     * across several successive rounds. The checklist itself is left
     * untouched: terminer() has no statut precondition, so the agent can
     * simply resubmit once they've addressed the issue.
     */
    public function refuser(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        if ($missionMenage->statut !== MissionMenage::STATUT_EN_ATTENTE_VALIDATION) {
            return response()->json([
                'message' => 'Cette mission n\'est pas en attente de validation.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'motif' => ['nullable', 'string', 'max:1000'],
            'motif_audio' => ['nullable', 'file', 'mimes:mp3,wav,ogg,webm,m4a,aac', 'max:5120'],
            'motif_photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:10240'],
        ], $this->uploadValidationMessages());

        $validator->after(function ($validator) use ($request) {
            $hasMotif = trim((string) $request->input('motif', '')) !== '';

            if (! $request->hasFile('motif_audio') && ! $request->hasFile('motif_photo') && ! $hasMotif) {
                $validator->errors()->add('motif', 'Fournissez un motif texte, audio ou photo.');
            }
        });

        $validated = $validator->validate();

        $motifAudioUrl = $request->hasFile('motif_audio')
            ? $request->file('motif_audio')->store('missions-menage-refus', 'public')
            : null;
        $motifPhotoUrl = $request->hasFile('motif_photo')
            ? $request->file('motif_photo')->store('missions-menage-refus', 'public')
            : null;

        $missionMenage->refus()->create([
            'manager_id' => $request->user()->id,
            'motif' => $validated['motif'] ?? null,
            'motif_audio_url' => $motifAudioUrl,
            'motif_photo_url' => $motifPhotoUrl,
        ]);

        $missionMenage->update(['statut' => MissionMenage::STATUT_NON_CONFORME]);

        return response()->json($missionMenage->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Mark every refus on this mission as seen by the cleaning agent --
     * dismisses the unread dot on the agent's "Refusé(e)s" tab. Idempotent.
     */
    public function marquerRefusVu(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        $missionMenage->refus()->where('vu', false)->update(['vu' => true]);

        return response()->json($missionMenage->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Update the forfait for a mission. Which catalogue products were used,
     * and how (stock_existant vs rachete), is handled per-product by
     * updateProduitUtilise()/detacherProduit() below -- each carries its own
     * proof (photo + real price) when rachete, so it can't be bulk-synced.
     */
    public function updateProduits(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        $validated = $request->validate([
            'frais_forfait' => ['sometimes', 'numeric', 'min:0'],
        ]);

        if (array_key_exists('frais_forfait', $validated)) {
            $missionMenage->update(['frais_forfait' => $validated['frais_forfait']]);
        }

        return response()->json($missionMenage->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Mark one catalogue product as used on this mission, one of two ways:
     * "stock_existant" (already present in the appartement, free -- no proof
     * needed) or "rachete" (the agent bought a new one -- a proof-of-purchase
     * photo and the real prix_paye are required, since that's what counts
     * towards the frais total, not the catalogue's generic prix). Called
     * again for the same product, it replaces its previous usage.
     */
    public function updateProduitUtilise(Request $request, MissionMenage $missionMenage, ProduitMenageCatalogue $produitCatalogue): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        $validated = $request->validate([
            'type_utilisation' => ['required', Rule::in([
                MissionMenage::TYPE_UTILISATION_STOCK_EXISTANT,
                MissionMenage::TYPE_UTILISATION_RACHETE,
            ])],
            'photo' => ['required_if:type_utilisation,'.MissionMenage::TYPE_UTILISATION_RACHETE, 'image', 'mimes:jpg,jpeg,png', 'max:5120'],
            'prix_paye' => ['required_if:type_utilisation,'.MissionMenage::TYPE_UTILISATION_RACHETE, 'numeric', 'min:0'],
        ]);

        $estRachete = $validated['type_utilisation'] === MissionMenage::TYPE_UTILISATION_RACHETE;

        $pivotData = [
            'type_utilisation' => $validated['type_utilisation'],
            'photo_url' => $estRachete ? $request->file('photo')->store('mission-menage-produits', 'public') : null,
            'prix_paye' => $estRachete ? $validated['prix_paye'] : null,
        ];

        $missionMenage->produits()->syncWithoutDetaching([$produitCatalogue->id => $pivotData]);

        return response()->json($missionMenage->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Un-check a catalogue product from this mission entirely (neither
     * stock_existant nor rachete anymore).
     */
    public function detacherProduit(Request $request, MissionMenage $missionMenage, ProduitMenageCatalogue $produitCatalogue): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        $missionMenage->produits()->detach($produitCatalogue->id);

        return response()->json($missionMenage->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Mark a mission as viewed by the cleaning agent (dismisses its
     * "Nouveau" badge). Idempotent.
     */
    public function marquerVue(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        if (! $missionMenage->vue) {
            $missionMenage->update(['vue' => true]);
        }

        return response()->json($missionMenage->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Report a cleaning product used in the field that is not in the catalogue yet.
     * Beyond the product's own photo, the agent must also account for what it
     * cost -- either typing the prix directly, or attaching a photo of the
     * purchase receipt (photo_ticket) for the Manager to read the price off
     * of at validation time. At least one of the two is required; both are
     * welcome.
     */
    public function signalerProduit(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        $validator = Validator::make($request->all(), [
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png', 'max:10240'],
            'note' => ['nullable', 'string', 'max:255'],
            'prix' => ['nullable', 'numeric', 'min:0'],
            'photo_ticket' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:10240'],
        ], $this->uploadValidationMessages());

        $validator->after(function ($validator) use ($request) {
            if (! $request->filled('prix') && ! $request->hasFile('photo_ticket')) {
                $validator->errors()->add('prix', 'Indiquez le prix payé ou une photo du ticket de caisse.');
            }
        });

        $validated = $validator->validate();

        $photoUrl = $request->file('photo')->store('produits-signales', 'public');
        $photoTicketUrl = $request->hasFile('photo_ticket')
            ? $request->file('photo_ticket')->store('produits-signales', 'public')
            : null;

        $produitSignale = ProduitMenageSignale::create([
            'mission_menage_id' => $missionMenage->id,
            'photo_url' => $photoUrl,
            'note' => $validated['note'] ?? null,
            'prix' => $validated['prix'] ?? null,
            'photo_ticket_url' => $photoTicketUrl,
            'statut' => ProduitMenageSignale::STATUT_EN_ATTENTE,
        ]);

        return response()->json($produitSignale, 201);
    }

    /**
     * Attach one or more "photo après ménage" to a mission -- the agent's
     * proof the job is (re)done, independent of the "Signaler un probleme"
     * flow (which reports a new issue, not evidence of finished work) and
     * of a checklist item's own photo_url (scoped to a single item). Used
     * both for the initial "Marquer terminé" (see terminer(), which
     * requires at least one) and, unchanged, after a Manager refus to show
     * the corrected work without re-checking every checklist item's photo.
     */
    public function ajouterPhotosPreuve(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        $validated = $request->validate([
            'photos' => ['required', 'array', 'min:1'],
            'photos.*' => ['image', 'mimes:jpg,jpeg,png', 'max:10240'],
            'note' => ['nullable', 'string', 'max:255'],
        ], $this->uploadValidationMessages());

        $photosPreuve = collect($validated['photos'])->map(function ($photo) use ($missionMenage, $validated) {
            return MissionMenagePhotoPreuve::create([
                'mission_menage_id' => $missionMenage->id,
                'photo_url' => $photo->store('missions-menage-photos-preuve', 'public'),
                'note' => $validated['note'] ?? null,
                'type' => MissionMenagePhotoPreuve::TYPE_APRES,
            ]);
        });

        return response()->json($photosPreuve->values(), 201);
    }

    /**
     * Report a maintenance problem found during a cleaning mission (broken
     * fixture, leak, ...). Creates an open, unassigned ticket for the
     * Manager to triage and hand off to a maintenance agent -- at least one
     * of photo/audio/description is required, since an empty report would
     * give the Manager nothing to act on.
     */
    public function signalerProbleme(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        $validator = Validator::make($request->all(), [
            'photos' => ['nullable', 'array'],
            'photos.*' => ['image', 'mimes:jpg,jpeg,png', 'max:10240'],
            'audio' => ['nullable', 'file', 'mimes:mp3,wav,ogg,webm,m4a,aac', 'max:5120'],
            'description' => ['nullable', 'string', 'max:1000'],
        ], $this->uploadValidationMessages());

        $validator->after(function ($validator) use ($request) {
            $hasDescription = trim((string) $request->input('description', '')) !== '';

            if (! $request->hasFile('photos') && ! $request->hasFile('audio') && ! $hasDescription) {
                $validator->errors()->add('description', 'Fournissez au moins une photo, un audio ou une description.');
            }
        });

        $validated = $validator->validate();

        $photos = collect($validated['photos'] ?? [])
            ->map(fn ($photo) => $photo->store('tickets-maintenance', 'public'))
            ->values();
        $audioUrl = $request->hasFile('audio') ? $request->file('audio')->store('tickets-maintenance', 'public') : null;

        $ticket = TicketMaintenance::create([
            'appartement_id' => $missionMenage->sejour->appartement_id,
            'mission_origine_id' => $missionMenage->id,
            'description' => $validated['description'] ?? null,
            'photo_url' => $photos->first(),
            'audio_url' => $audioUrl,
            'statut' => TicketMaintenance::STATUT_OUVERT,
        ]);

        foreach ($photos->slice(1) as $photoUrl) {
            $ticket->photosSignalement()->create([
                'contexte' => TicketMaintenancePhoto::CONTEXTE_SIGNALEMENT,
                'photo_url' => $photoUrl,
            ]);
        }

        return response()->json($ticket->load('photosSignalement'), 201);
    }
}
