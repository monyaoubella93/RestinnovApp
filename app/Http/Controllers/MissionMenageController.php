<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesMissionAccess;
use App\Http\Controllers\Concerns\HasFriendlyUploadMessages;
use App\Models\MissionMenage;
use App\Models\MissionMenagePhotoPreuve;
use App\Models\ProduitMenageSignale;
use App\Models\TicketMaintenance;
use App\Models\Utilisateur;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

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
            'produits' => $mission->produits->map(fn ($produit) => [
                'nom' => $produit->nom,
                'prix' => round((float) $produit->prix, 2),
                'photo_url' => $produit->photo_url,
            ])->values(),
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
            $fraisProduitsTotal = (float) $mission->produits->sum('prix');

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
                'produits' => $mission->produits->map(fn ($produit) => [
                    'nom' => $produit->nom,
                    'prix' => round((float) $produit->prix, 2),
                    'photo_url' => $produit->photo_url,
                ])->values(),
                'frais_forfait' => round($fraisForfait, 2),
                'frais_produits_total' => round($fraisProduitsTotal, 2),
                'frais_total' => round($fraisForfait + $fraisProduitsTotal, 2),
            ];
        })->values());
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
     * (vue -> true) and, the first time, starts the clock on it
     * (a_faire -> en_cours). Idempotent -- reopening an already-seen,
     * already-en_cours mission is a no-op beyond returning its detail.
     */
    public function ouvrir(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        $updates = [];

        if (! $missionMenage->vue) {
            $updates['vue'] = true;
        }

        if ($missionMenage->statut === MissionMenage::STATUT_A_FAIRE) {
            $updates['statut'] = MissionMenage::STATUT_EN_COURS;
        }

        if ($updates) {
            $missionMenage->update($updates);
        }

        return response()->json($missionMenage->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Marks a mission "en_attente_validation" once its whole checklist is
     * checked off -- the agent's part of the job is done, but the
     * appartement only becomes "disponible" again once a manager reviews
     * and validates it (see valider()). A mission with no checklist items
     * at all (no checklist_modele was assigned to the appartement) has
     * nothing to block on, so it can always be marked terminee.
     */
    public function terminer(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        $resteACocher = $missionMenage->checklistItems()->where('coche', false)->exists();

        if ($resteACocher) {
            return response()->json([
                'message' => 'Tous les éléments de la checklist doivent être cochés avant de marquer la mission terminée.',
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
     * Update the forfait and the catalogue products checked for a mission.
     */
    public function updateProduits(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        $validated = $request->validate([
            'frais_forfait' => ['sometimes', 'numeric', 'min:0'],
            'produit_ids' => ['sometimes', 'array'],
            'produit_ids.*' => ['integer', 'exists:produits_menage_catalogue,id'],
        ]);

        DB::transaction(function () use ($missionMenage, $validated) {
            if (array_key_exists('frais_forfait', $validated)) {
                $missionMenage->update(['frais_forfait' => $validated['frais_forfait']]);
            }

            if (array_key_exists('produit_ids', $validated)) {
                $missionMenage->produits()->sync($validated['produit_ids']);
            }
        });

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
     */
    public function signalerProduit(Request $request, MissionMenage $missionMenage): JsonResponse
    {
        $this->authorizeMissionAccess($request, $missionMenage);

        $validated = $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png', 'max:10240'],
            'note' => ['nullable', 'string', 'max:255'],
        ], $this->uploadValidationMessages());

        $photoUrl = $request->file('photo')->store('produits-signales', 'public');

        $produitSignale = ProduitMenageSignale::create([
            'mission_menage_id' => $missionMenage->id,
            'photo_url' => $photoUrl,
            'note' => $validated['note'] ?? null,
            'statut' => ProduitMenageSignale::STATUT_EN_ATTENTE,
        ]);

        return response()->json($produitSignale, 201);
    }

    /**
     * Attach one or more "photo de preuve de travail" to a mission -- proof
     * the agent has (re)done the job, independent of the "Signaler un
     * probleme" flow (which reports a new issue, not evidence of finished
     * work) and of a checklist item's own photo_url (scoped to a single
     * item). Particularly useful after a Manager refus, to show the
     * corrected work without re-checking every checklist item's photo.
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
            'photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:10240'],
            'audio' => ['nullable', 'file', 'mimes:mp3,wav,ogg,webm,m4a,aac', 'max:5120'],
            'description' => ['nullable', 'string', 'max:1000'],
        ], $this->uploadValidationMessages());

        $validator->after(function ($validator) use ($request) {
            $hasDescription = trim((string) $request->input('description', '')) !== '';

            if (! $request->hasFile('photo') && ! $request->hasFile('audio') && ! $hasDescription) {
                $validator->errors()->add('description', 'Fournissez au moins une photo, un audio ou une description.');
            }
        });

        $validated = $validator->validate();

        $photoUrl = $request->hasFile('photo') ? $request->file('photo')->store('tickets-maintenance', 'public') : null;
        $audioUrl = $request->hasFile('audio') ? $request->file('audio')->store('tickets-maintenance', 'public') : null;

        $ticket = TicketMaintenance::create([
            'appartement_id' => $missionMenage->sejour->appartement_id,
            'mission_origine_id' => $missionMenage->id,
            'description' => $validated['description'] ?? null,
            'photo_url' => $photoUrl,
            'audio_url' => $audioUrl,
            'statut' => TicketMaintenance::STATUT_OUVERT,
        ]);

        return response()->json($ticket, 201);
    }
}
