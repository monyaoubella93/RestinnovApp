<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\HasFriendlyUploadMessages;
use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use App\Models\Utilisateur;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class AppartementController extends Controller
{
    use HasFriendlyUploadMessages;

    /**
     * Display a listing of appartements, with optional search/filtering,
     * sorting and pagination for the "Liste des appartements" screen.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['sometimes', 'string'],
            'statut' => ['sometimes', 'string'],
            'sort_by' => ['sometimes', 'in:nom'],
            'sort_dir' => ['sometimes', 'in:asc,desc'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $query = Appartement::with(['checklistModeles', 'agentHabituel', 'proprietaire'])
            ->withCount('sejours')
            ->withMax('sejours', 'date_depart')
            ->avecStatutCalcule();

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($q) use ($search) {
                $q->where('nom', 'like', "%{$search}%")
                    ->orWhere('adresse', 'like', "%{$search}%");
            });
        }

        if (! empty($validated['statut'])) {
            // Mirrors statutCalcule() exactly: "maintenance" only while an
            // unresolved ticket exists (ouvert/assigne/resolu_en_attente_
            // validation/a_refaire -- only the Manager's final "resolu"
            // actually frees the appartement), "occupé" only while a sejour is
            // actually en_cours (and no such ticket), "en_menage" only
            // while a mission_menage is still active
            // (a_faire/en_cours/en_attente_validation) with neither of the
            // above, "disponible" otherwise -- the stored `statut` column
            // is never authoritative, filtering has to match the same live
            // computation used for display.
            $ticketOuvert = fn ($q) => $q->whereIn('statut', [
                TicketMaintenance::STATUT_OUVERT,
                TicketMaintenance::STATUT_ASSIGNE,
                TicketMaintenance::STATUT_RESOLU_EN_ATTENTE_VALIDATION,
                TicketMaintenance::STATUT_A_REFAIRE,
            ]);
            $enCours = fn ($q) => $q->where('statut', Sejour::STATUT_EN_COURS);
            $missionActive = fn ($q) => $q->whereHas(
                'missionMenage',
                fn ($q2) => $q2->whereIn('statut', [MissionMenage::STATUT_A_FAIRE, MissionMenage::STATUT_EN_COURS, MissionMenage::STATUT_EN_ATTENTE_VALIDATION]),
            );

            if ($validated['statut'] === Appartement::STATUT_MAINTENANCE) {
                $query->whereHas('ticketsMaintenance', $ticketOuvert);
            } elseif ($validated['statut'] === Appartement::STATUT_OCCUPE) {
                $query->whereDoesntHave('ticketsMaintenance', $ticketOuvert)
                    ->whereHas('sejours', $enCours);
            } elseif ($validated['statut'] === Appartement::STATUT_EN_MENAGE) {
                $query->whereDoesntHave('ticketsMaintenance', $ticketOuvert)
                    ->whereDoesntHave('sejours', $enCours)
                    ->whereHas('sejours', $missionActive);
            } else {
                $query->whereDoesntHave('ticketsMaintenance', $ticketOuvert)
                    ->whereDoesntHave('sejours', $enCours)
                    ->whereDoesntHave('sejours', $missionActive);
            }
        }

        $sortBy = $validated['sort_by'] ?? 'nom';
        $sortDir = $validated['sort_dir'] ?? 'asc';
        $query->orderBy($sortBy, $sortDir);

        $withComputedAttributes = fn (Appartement $appartement) => $appartement
            ->setAttribute('dernier_sejour', $appartement->sejours_max_date_depart)
            ->setAttribute('statut', $appartement->statutCalcule());

        // Pagination only kicks in when explicitly requested (the "Liste des
        // appartements" screen). Every other consumer (dropdowns, checkbox
        // lists, ...) keeps getting the full flat array it always has.
        if (array_key_exists('page', $validated) || array_key_exists('per_page', $validated)) {
            $perPage = $validated['per_page'] ?? 10;
            $paginated = $query->paginate($perPage)->withQueryString();
            $paginated->getCollection()->each($withComputedAttributes);

            return response()->json($paginated);
        }

        return response()->json($query->get()->each($withComputedAttributes));
    }

    /**
     * Store a newly created appartement.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nom' => ['required', 'string', 'max:255'],
            'adresse' => ['required', 'string', 'max:255'],
            'photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:10240'],
            'checklist_modele_ids' => ['sometimes', 'array'],
            'checklist_modele_ids.*' => ['integer', 'exists:checklist_modeles,id'],
            'agent_habituel_id' => [
                'nullable',
                // Only enforced on creation: a brand new appartement has no
                // pre-existing assignment, so there is no legacy value to
                // preserve -- an inactive agent simply cannot be picked.
                Rule::exists('utilisateurs', 'id')->where('role', Utilisateur::ROLE_MENAGE)->where('actif', true),
            ],
            'proprietaire_id' => ['nullable', 'exists:proprietaires,id'],
            'mode_gestion' => ['sometimes', Rule::in([Appartement::MODE_GESTION_MANDAT, Appartement::MODE_GESTION_SOUS_LOCATION])],
            'taux_commission' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'loyer_fixe_mensuel' => ['nullable', 'numeric', 'min:0'],
        ], $this->uploadValidationMessages());

        if ($request->hasFile('photo')) {
            $validated['photo_principale'] = $request->file('photo')->store('appartements', 'public');
        }
        unset($validated['photo']);

        $checklistModeleIds = $validated['checklist_modele_ids'] ?? [];
        unset($validated['checklist_modele_ids']);

        $validated['statut'] = Appartement::STATUT_DISPONIBLE;
        $validated['mode_gestion'] ??= Appartement::MODE_GESTION_MANDAT;

        $appartement = Appartement::create($validated);
        $appartement->checklistModeles()->sync($checklistModeleIds);

        return response()->json($appartement->load(['checklistModeles', 'agentHabituel', 'proprietaire']), 201);
    }

    /**
     * Update an existing appartement. The "statut" field is always managed
     * automatically by the checkout/mission workflow and is never
     * accepted here, even implicitly.
     */
    public function update(Request $request, Appartement $appartement): JsonResponse
    {
        $validated = $request->validate([
            'nom' => ['required', 'string', 'max:255'],
            'adresse' => ['required', 'string', 'max:255'],
            'photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:10240'],
            'checklist_modele_ids' => ['sometimes', 'array'],
            'checklist_modele_ids.*' => ['integer', 'exists:checklist_modeles,id'],
            // No actif=true requirement here (unlike store()): an appartement
            // may already have an agent_habituel who has since been
            // deactivated, and re-submitting the form to edit unrelated
            // fields must not fail because of that stale assignment. Newly
            // *picking* an inactive agent is prevented upstream instead --
            // the "Agent habituel" dropdown is only ever populated with
            // active agents.
            'agent_habituel_id' => [
                'nullable',
                Rule::exists('utilisateurs', 'id')->where('role', Utilisateur::ROLE_MENAGE),
            ],
            'proprietaire_id' => ['nullable', 'exists:proprietaires,id'],
            'mode_gestion' => ['sometimes', Rule::in([Appartement::MODE_GESTION_MANDAT, Appartement::MODE_GESTION_SOUS_LOCATION])],
            'taux_commission' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'loyer_fixe_mensuel' => ['nullable', 'numeric', 'min:0'],
        ], $this->uploadValidationMessages());

        if ($request->hasFile('photo')) {
            $validated['photo_principale'] = $request->file('photo')->store('appartements', 'public');
        }
        unset($validated['photo']);

        $checklistModeleIds = $validated['checklist_modele_ids'] ?? [];
        unset($validated['checklist_modele_ids']);

        $appartement->update($validated);
        $appartement->checklistModeles()->sync($checklistModeleIds);

        return response()->json($appartement->fresh()->load(['checklistModeles', 'agentHabituel', 'proprietaire']));
    }

    /**
     * The appartement's monthly owner statement: gross revenue, cleaning/
     * maintenance costs, net result, and the resulting owner payout --
     * mandat mode deducts a commission from the net result, sous_location
     * mode pays the fixed rent regardless of how the month performed.
     */
    public function releve(Request $request, Appartement $appartement): JsonResponse
    {
        $validated = $request->validate([
            'mois' => ['required', 'date_format:Y-m'],
        ]);

        return response()->json($this->buildReleve($appartement, $validated['mois']));
    }

    /**
     * The appartement's full cleaning-mission history: every mission ever
     * generated for one of its sejours, most recent first, with its
     * checklist (grouped by the modele(s) it came from), the products used,
     * the forfait/total cost, and its final validation statut.
     */
    public function historique(Appartement $appartement): JsonResponse
    {
        $missions = MissionMenage::query()
            ->whereHas('sejour', fn ($q) => $q->where('appartement_id', $appartement->id))
            ->with(['sejour', 'produits', 'checklistItems'])
            ->get()
            ->sortByDesc(fn (MissionMenage $mission) => $mission->sejour->date_depart)
            ->values();

        return response()->json($missions->map(function (MissionMenage $mission) {
            $fraisForfait = (float) $mission->frais_forfait;
            $fraisProduitsTotal = (float) $mission->produits->sum('prix');

            return [
                'id' => $mission->id,
                'statut' => $mission->statut,
                'sejour' => [
                    'id' => $mission->sejour->id,
                    'reference' => $mission->sejour->reference,
                    'date_arrivee' => $mission->sejour->date_arrivee->toDateString(),
                    'date_depart' => $mission->sejour->date_depart->toDateString(),
                    'nom_voyageur' => $mission->sejour->nom_voyageur,
                ],
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
     * The same monthly releve as a downloadable PDF invoice.
     */
    public function relevePdf(Request $request, Appartement $appartement): Response
    {
        $validated = $request->validate([
            'mois' => ['required', 'date_format:Y-m'],
        ]);

        $releve = $this->buildReleve($appartement, $validated['mois']);

        $pdf = Pdf::loadView('releves.pdf', $releve);

        $nomFichier = sprintf('releve-%s-%s.pdf', str_replace(' ', '-', $appartement->nom), $validated['mois']);

        return $pdf->download($nomFichier);
    }

    /**
     * Shared by releve() and relevePdf() so the JSON summary and the PDF
     * are always computed from the exact same numbers.
     */
    private function buildReleve(Appartement $appartement, string $mois): array
    {
        $debut = Carbon::createFromFormat('Y-m-d', $mois.'-01')->startOfMonth();
        $fin = $debut->copy()->endOfMonth();

        $sejours = Sejour::where('appartement_id', $appartement->id)
            ->where('date_arrivee', '<', $fin->toDateString())
            ->where('date_depart', '>', $debut->toDateString())
            ->with(['missionMenage.produits', 'fraisMaintenance'])
            ->orderBy('date_arrivee')
            ->get();

        $revenusBruts = (float) $sejours->sum('montant_mad');

        $fraisMenageTotal = 0.0;
        $fraisMenageDetail = [];
        foreach ($sejours as $sejour) {
            $mission = $sejour->missionMenage;
            if (! $mission) {
                continue;
            }

            $forfait = (float) $mission->frais_forfait;
            $produitsTotal = (float) $mission->produits->sum('prix');
            $fraisMenageTotal += $forfait + $produitsTotal;

            $fraisMenageDetail[] = [
                'sejour_id' => $sejour->id,
                'nom_voyageur' => $sejour->nom_voyageur,
                'forfait' => round($forfait, 2),
                'produits' => $mission->produits->map(fn ($produit) => [
                    'nom' => $produit->nom,
                    'prix' => round((float) $produit->prix, 2),
                ])->values(),
            ];
        }

        $fraisMaintenanceTotal = 0.0;
        $fraisMaintenanceDetail = [];
        foreach ($sejours as $sejour) {
            foreach ($sejour->fraisMaintenance as $frais) {
                $fraisMaintenanceTotal += (float) $frais->prix;
                $fraisMaintenanceDetail[] = [
                    'sejour_id' => $sejour->id,
                    'description' => $frais->description,
                    'prix' => round((float) $frais->prix, 2),
                ];
            }
        }

        $resultatNet = $revenusBruts - $fraisMenageTotal - $fraisMaintenanceTotal;

        if ($appartement->mode_gestion === Appartement::MODE_GESTION_SOUS_LOCATION) {
            $montantProprietaire = (float) ($appartement->loyer_fixe_mensuel ?? 0);
        } else {
            $tauxCommission = (float) ($appartement->taux_commission ?? 0);
            $montantProprietaire = $resultatNet * (1 - $tauxCommission / 100);
        }

        $commissionRestinnov = $resultatNet - $montantProprietaire;

        return [
            'appartement' => [
                'id' => $appartement->id,
                'nom' => $appartement->nom,
                'adresse' => $appartement->adresse,
                'mode_gestion' => $appartement->mode_gestion,
                'taux_commission' => $appartement->taux_commission,
                'loyer_fixe_mensuel' => $appartement->loyer_fixe_mensuel,
                'proprietaire' => $appartement->proprietaire,
            ],
            'mois' => $mois,
            'revenus_bruts' => round($revenusBruts, 2),
            'frais_menage_total' => round($fraisMenageTotal, 2),
            'frais_maintenance_total' => round($fraisMaintenanceTotal, 2),
            'resultat_net' => round($resultatNet, 2),
            'montant_proprietaire' => round($montantProprietaire, 2),
            'commission_restinnov' => round($commissionRestinnov, 2),
            'sejours' => $sejours->map(fn (Sejour $sejour) => [
                'id' => $sejour->id,
                'nom_voyageur' => $sejour->nom_voyageur,
                'date_arrivee' => $sejour->date_arrivee->toDateString(),
                'date_depart' => $sejour->date_depart->toDateString(),
                'montant_mad' => round((float) $sejour->montant_mad, 2),
            ])->values(),
            'frais_menage_detail' => $fraisMenageDetail,
            'frais_maintenance_detail' => $fraisMaintenanceDetail,
        ];
    }
}
