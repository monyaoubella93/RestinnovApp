<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\HasFriendlyUploadMessages;
use App\Models\Appartement;
use App\Models\ChargeAppartement;
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

        $query = Appartement::with(['checklistModeles', 'agentHabituel', 'proprietaire', 'chargesActives'])
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
     * The single-appartement detail screen: the appartement itself (photo,
     * checklists, agent habituel, propriétaire, charges actives, statut,
     * séjours count/dernier), the current month's financial summary (the
     * same numbers as the relevé, reused rather than recomputed
     * differently), and its linked maintenance tickets with the same
     * "récurrent" flag used on the Tickets de maintenance screen. Nothing
     * here is new data -- it is all already computed/stored elsewhere,
     * just gathered into one response for this screen.
     */
    public function show(Appartement $appartement): JsonResponse
    {
        $appartement = Appartement::with(['checklistModeles', 'agentHabituel', 'proprietaire', 'chargesActives'])
            ->withCount('sejours')
            ->withMax('sejours', 'date_depart')
            ->avecStatutCalcule()
            ->findOrFail($appartement->id);

        $appartement->setAttribute('dernier_sejour', $appartement->sejours_max_date_depart);
        $appartement->setAttribute('statut', $appartement->statutCalcule());

        $mois = now()->format('Y-m');
        $releve = $this->buildReleve($appartement, $mois);

        return response()->json([
            'appartement' => $appartement,
            'resume_financier' => [
                'mois' => $mois,
                'revenus_bruts' => $releve['revenus_bruts'],
                'frais_menage_total' => $releve['frais_menage_total'],
                'frais_maintenance_total' => $releve['frais_maintenance_total'],
                'resultat_net' => $releve['resultat_net'],
            ],
            'tickets_maintenance' => $appartement->ticketsMaintenance()->with('agent')->latest()->get(),
            'tickets_maintenance_recurrent' => TicketMaintenance::estRecurrentPourAppartement($appartement->id),
        ]);
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
            'charges' => ['sometimes', 'array'],
            'charges.*.nom_service' => ['required', 'string', 'max:255'],
            'charges.*.montant' => ['required', 'numeric', 'min:0'],
            'charges.*.frequence' => ['required', Rule::in([ChargeAppartement::FREQUENCE_MENSUEL, ChargeAppartement::FREQUENCE_ANNUEL])],
            'charges.*.a_charge_de' => ['required', Rule::in([ChargeAppartement::A_CHARGE_RESTINNOV, ChargeAppartement::A_CHARGE_PROPRIETAIRE])],
        ], $this->uploadValidationMessages());

        if ($request->hasFile('photo')) {
            $validated['photo_principale'] = $request->file('photo')->store('appartements', 'public');
        }
        unset($validated['photo']);

        $checklistModeleIds = $validated['checklist_modele_ids'] ?? [];
        unset($validated['checklist_modele_ids']);

        $charges = $validated['charges'] ?? [];
        unset($validated['charges']);

        $validated['statut'] = Appartement::STATUT_DISPONIBLE;
        $validated['mode_gestion'] ??= Appartement::MODE_GESTION_MANDAT;

        $appartement = Appartement::create($validated);
        $appartement->checklistModeles()->sync($checklistModeleIds);

        foreach ($charges as $chargeInput) {
            $appartement->chargesAppartement()->create([
                'nom_service' => $chargeInput['nom_service'],
                'montant' => $chargeInput['montant'],
                'frequence' => $chargeInput['frequence'],
                'a_charge_de' => $chargeInput['a_charge_de'],
                'date_debut' => now()->toDateString(),
            ]);
        }

        return response()->json($appartement->load(['checklistModeles', 'agentHabituel', 'proprietaire', 'chargesActives']), 201);
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
            'charges' => ['sometimes', 'array'],
            'charges.*.id' => ['sometimes', 'integer', 'exists:charges_appartement,id'],
            'charges.*.nom_service' => ['required', 'string', 'max:255'],
            'charges.*.montant' => ['required', 'numeric', 'min:0'],
            'charges.*.frequence' => ['required', Rule::in([ChargeAppartement::FREQUENCE_MENSUEL, ChargeAppartement::FREQUENCE_ANNUEL])],
            'charges.*.a_charge_de' => ['required', Rule::in([ChargeAppartement::A_CHARGE_RESTINNOV, ChargeAppartement::A_CHARGE_PROPRIETAIRE])],
        ], $this->uploadValidationMessages());

        if ($request->hasFile('photo')) {
            $validated['photo_principale'] = $request->file('photo')->store('appartements', 'public');
        }
        unset($validated['photo']);

        $checklistModeleIds = $validated['checklist_modele_ids'] ?? [];
        unset($validated['checklist_modele_ids']);

        // FormData can't carry a truly empty array (an empty `charges`
        // would simply produce no field at all), so an explicit
        // sync_charges flag -- not the mere presence of the `charges` key
        // -- is what tells us the form is submitting its full, current
        // list (possibly empty, e.g. every service was unchecked) versus
        // an unrelated caller that never touches charges at all.
        $charges = $validated['charges'] ?? [];
        unset($validated['charges']);

        $appartement->update($validated);
        $appartement->checklistModeles()->sync($checklistModeleIds);

        if ($request->boolean('sync_charges')) {
            $this->syncCharges($appartement, $charges);
        }

        return response()->json($appartement->fresh()->load(['checklistModeles', 'agentHabituel', 'proprietaire', 'chargesActives']));
    }

    /**
     * Reconciles an appartement's active charges with the form's submitted
     * list: a charge carrying an existing id is updated in place, one
     * without an id is a brand new service (starts today), and any
     * currently-active charge missing from the list is closed (date_fin =
     * today) rather than deleted -- so a past relevé still finds it.
     */
    private function syncCharges(Appartement $appartement, array $charges): void
    {
        $chargesActives = $appartement->chargesAppartement()->whereNull('date_fin')->get()->keyBy('id');
        $idsSoumis = collect($charges)->pluck('id')->filter()->all();

        foreach ($charges as $chargeInput) {
            $id = $chargeInput['id'] ?? null;

            if ($id && $chargesActives->has($id)) {
                $chargesActives[$id]->update([
                    'nom_service' => $chargeInput['nom_service'],
                    'montant' => $chargeInput['montant'],
                    'frequence' => $chargeInput['frequence'],
                    'a_charge_de' => $chargeInput['a_charge_de'],
                ]);
            } else {
                $appartement->chargesAppartement()->create([
                    'nom_service' => $chargeInput['nom_service'],
                    'montant' => $chargeInput['montant'],
                    'frequence' => $chargeInput['frequence'],
                    'a_charge_de' => $chargeInput['a_charge_de'],
                    'date_debut' => now()->toDateString(),
                ]);
            }
        }

        foreach ($chargesActives as $id => $charge) {
            if (! in_array($id, $idsSoumis, true)) {
                $charge->update(['date_fin' => now()->toDateString()]);
            }
        }
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
            $fraisProduitsTotal = $mission->fraisProduitsTotal();

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
                'produits' => $mission->produitsDetail(),
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
            $produitsTotal = $mission->fraisProduitsTotal();
            $fraisMenageTotal += $forfait + $produitsTotal;

            $fraisMenageDetail[] = [
                'sejour_id' => $sejour->id,
                'nom_voyageur' => $sejour->nom_voyageur,
                'forfait' => round($forfait, 2),
                'produits' => $mission->produitsDetail(),
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

        // A charge is included if it overlaps the month at all (like the
        // sejour date-range queries above) -- no day-level proration for
        // a charge starting/ending mid-month, only the frequence-based one
        // below. Only "restinnov" charges reduce the propriétaire's payout;
        // "proprietaire" charges are shown on the relevé for information
        // only, since the owner pays and manages those themselves.
        $charges = $appartement->chargesAppartement()
            ->where('date_debut', '<=', $fin->toDateString())
            ->where(fn ($q) => $q->whereNull('date_fin')->orWhere('date_fin', '>=', $debut->toDateString()))
            ->orderBy('date_debut')
            ->get();

        $chargesDetail = $charges->map(fn (ChargeAppartement $charge) => [
            'id' => $charge->id,
            'nom_service' => $charge->nom_service,
            'montant' => round((float) $charge->montant, 2),
            'frequence' => $charge->frequence,
            'a_charge_de' => $charge->a_charge_de,
            'montant_mensuel' => $charge->montantMensuel(),
        ])->values();

        $chargesRestinnovTotal = round($chargesDetail
            ->where('a_charge_de', ChargeAppartement::A_CHARGE_RESTINNOV)
            ->sum('montant_mensuel'), 2);
        $chargesProprietaireTotal = round($chargesDetail
            ->where('a_charge_de', ChargeAppartement::A_CHARGE_PROPRIETAIRE)
            ->sum('montant_mensuel'), 2);

        $depensesTotal = $fraisMenageTotal + $fraisMaintenanceTotal + $chargesRestinnovTotal;
        $resultatNet = $revenusBruts - $depensesTotal;

        // The commission is always taken on the gross chiffre d'affaires
        // (not on the net result after charges) -- matches how RestInnov's
        // real invoices are computed: propriétaire is paid CA - charges -
        // commission, not (CA - charges) x (1 - taux).
        if ($appartement->mode_gestion === Appartement::MODE_GESTION_SOUS_LOCATION) {
            $montantProprietaire = (float) ($appartement->loyer_fixe_mensuel ?? 0);
            $commissionRestinnov = $resultatNet - $montantProprietaire;
        } else {
            $tauxCommission = (float) ($appartement->taux_commission ?? 0);
            $commissionRestinnov = $revenusBruts * $tauxCommission / 100;
            $montantProprietaire = $resultatNet - $commissionRestinnov;
        }

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
            'charges_restinnov_total' => $chargesRestinnovTotal,
            'charges_proprietaire_total' => $chargesProprietaireTotal,
            'resultat_net' => round($resultatNet, 2),
            'montant_proprietaire' => round($montantProprietaire, 2),
            'commission_restinnov' => round($commissionRestinnov, 2),
            'sejours' => $sejours->map(fn (Sejour $sejour) => [
                'id' => $sejour->id,
                'nom_voyageur' => $sejour->nom_voyageur,
                'date_arrivee' => $sejour->date_arrivee->toDateString(),
                'date_depart' => $sejour->date_depart->toDateString(),
                'nuitees' => $sejour->date_arrivee->diffInDays($sejour->date_depart),
                'periode' => $this->periodeSejour($sejour->date_arrivee, $sejour->date_depart),
                'montant_mad' => round((float) $sejour->montant_mad, 2),
            ])->values(),
            'frais_menage_detail' => $fraisMenageDetail,
            'frais_maintenance_detail' => $fraisMaintenanceDetail,
            'charges_detail' => $chargesDetail,
        ];
    }

    /**
     * The invoice's short "Séjour N: dd-dd/mm" label -- the departure date
     * shown is the last night stayed, not the checkout date, and a
     * single-night stay collapses to just its one date.
     */
    private function periodeSejour(Carbon $arrivee, Carbon $depart): string
    {
        $derniereNuit = $depart->copy()->subDay();

        if ($arrivee->isSameDay($derniereNuit)) {
            return $arrivee->format('d/m');
        }

        if ($arrivee->isSameMonth($derniereNuit)) {
            return sprintf('%s-%s/%s', $arrivee->format('d'), $derniereNuit->format('d'), $arrivee->format('m'));
        }

        return sprintf('%s - %s', $arrivee->format('d/m'), $derniereNuit->format('d/m'));
    }
}
