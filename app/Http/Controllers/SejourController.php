<?php

namespace App\Http\Controllers;

use App\Models\Appartement;
use App\Models\Sejour;
use App\Models\Voyageur;
use App\Services\SejourCheckoutService;
use App\Services\SejourStatutService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorContract;

class SejourController extends Controller
{
    public function __construct(
        private readonly SejourCheckoutService $checkoutService,
        private readonly SejourStatutService $statutService,
    ) {}

    /**
     * Display a listing of sejours, with optional search/filtering, sorting
     * and pagination for the "Liste des séjours" screen.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['sometimes', 'string'],
            'statut' => ['sometimes', 'in:a_venir,en_cours,termine'],
            'appartement_id' => ['sometimes', 'integer', 'exists:appartements,id'],
            'date_debut' => ['sometimes', 'date'],
            'date_fin' => ['sometimes', 'date'],
            'sort_by' => ['sometimes', 'in:date_arrivee,date_depart'],
            'sort_dir' => ['sometimes', 'in:asc,desc'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $query = Sejour::with(['appartement', 'missionMenage.agent', 'missionMenage.produits', 'missionMenage.checklistItems', 'missionMenage.produitsSignales', 'missionMenage.photosPreuve', 'missionMenage.refus', 'voyageurs', 'fraisMaintenance'])
            ->withCount('voyageurs');

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($q) use ($search) {
                $q->where('nom_voyageur', 'like', "%{$search}%")
                    ->orWhere('reference', 'like', "%{$search}%")
                    ->orWhereHas('appartement', function ($q2) use ($search) {
                        $q2->where('nom', 'like', "%{$search}%");
                    });
            });
        }

        if (! empty($validated['statut'])) {
            $query->where('statut', $validated['statut']);
        }

        if (! empty($validated['appartement_id'])) {
            $query->where('appartement_id', $validated['appartement_id']);
        }

        if (! empty($validated['date_debut'])) {
            $query->whereDate('date_arrivee', '>=', $validated['date_debut']);
        }

        if (! empty($validated['date_fin'])) {
            $query->whereDate('date_arrivee', '<=', $validated['date_fin']);
        }

        $sortBy = $validated['sort_by'] ?? 'date_arrivee';
        $sortDir = $validated['sort_dir'] ?? 'desc';
        $query->orderBy($sortBy, $sortDir)->orderBy('id', $sortDir);

        $perPage = $validated['per_page'] ?? 10;

        return response()->json($query->paginate($perPage)->withQueryString());
    }

    /**
     * Display a single sejour with all of its detail relations.
     */
    public function show(Sejour $sejour): JsonResponse
    {
        return response()->json(
            $sejour->load(['appartement', 'missionMenage.agent', 'missionMenage.produits', 'missionMenage.checklistItems', 'missionMenage.produitsSignales', 'missionMenage.photosPreuve', 'missionMenage.refus', 'voyageurs', 'fraisMaintenance'])
                ->loadCount('voyageurs'),
        );
    }

    /**
     * Store a newly created sejour along with its voyageurs.
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'appartement_id' => ['required', 'exists:appartements,id'],
            'date_arrivee' => ['required', 'date'],
            'date_depart' => ['required', 'date', 'after:date_arrivee'],
            'plateforme_origine' => ['sometimes', 'in:airbnb,direct,autre,booking'],
            'montant_mad' => ['nullable', 'numeric', 'min:0'],
            'statut' => ['sometimes', 'in:a_venir,en_cours,termine'],
            'voyageurs' => ['required', 'array', 'min:1'],
            'voyageurs.*.nom' => ['required', 'string', 'max:255'],
            'voyageurs.*.numero_passeport' => ['nullable', 'string', 'max:255'],
            'voyageurs.*.telephone' => ['nullable', 'string', 'max:255'],
            'voyageurs.*.est_principal' => ['required', 'boolean'],
            'voyageurs.*.type' => ['sometimes', 'in:adulte,enfant'],
        ]);

        $this->validateVoyageurs($validator, $request);

        $validated = $validator->validate();

        if ($rejection = $this->rejectIfAppartementEnMaintenance((int) $validated['appartement_id'])) {
            return $rejection;
        }

        $chevauchant = $this->findChevauchement(
            (int) $validated['appartement_id'],
            $validated['date_arrivee'],
            $validated['date_depart'],
        );

        if ($chevauchant) {
            return response()->json([
                'message' => $this->messageChevauchement($chevauchant),
            ], 422);
        }

        $sejour = DB::transaction(function () use ($validated) {
            $principal = collect($validated['voyageurs'])
                ->first(fn ($v) => filter_var($v['est_principal'], FILTER_VALIDATE_BOOLEAN));

            $sejour = Sejour::create([
                'appartement_id' => $validated['appartement_id'],
                'date_arrivee' => $validated['date_arrivee'],
                'date_depart' => $validated['date_depart'],
                'nom_voyageur' => $principal['nom'],
                'statut' => $validated['statut'] ?? Sejour::STATUT_A_VENIR,
                'plateforme_origine' => $validated['plateforme_origine'] ?? Sejour::PLATEFORME_AIRBNB,
                'montant_mad' => $validated['montant_mad'] ?? 0,
            ]);

            $this->syncVoyageurs($sejour, $validated['voyageurs']);

            // A sejour created with an arrival (and possibly departure) date
            // already in the past must reflect its real status immediately,
            // exactly like the scheduled catch-up jobs would do on their
            // next run -- don't leave it stuck at "a_venir".
            $this->statutService->activerSiNecessaire($sejour);

            if ($sejour->statut === Sejour::STATUT_EN_COURS && $sejour->date_depart->lte(now()->startOfDay())) {
                $this->checkoutService->checkout($sejour);
            }

            return $sejour;
        });

        return response()->json($sejour->fresh()->load(['appartement', 'voyageurs', 'missionMenage']), 201);
    }

    /**
     * Update an existing sejour and replace its voyageurs. Not allowed once
     * the sejour is "termine" (its cleaning mission already exists).
     */
    public function update(Request $request, Sejour $sejour): JsonResponse
    {
        if ($sejour->statut === Sejour::STATUT_TERMINE) {
            return response()->json([
                'message' => 'Ce séjour est déjà terminé et ne peut plus être modifié.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'appartement_id' => ['required', 'exists:appartements,id'],
            'date_arrivee' => ['required', 'date'],
            'date_depart' => ['required', 'date', 'after:date_arrivee'],
            'plateforme_origine' => ['sometimes', 'in:airbnb,direct,autre,booking'],
            'montant_mad' => ['nullable', 'numeric', 'min:0'],
            'voyageurs' => ['required', 'array', 'min:1'],
            'voyageurs.*.nom' => ['required', 'string', 'max:255'],
            'voyageurs.*.numero_passeport' => ['nullable', 'string', 'max:255'],
            'voyageurs.*.telephone' => ['nullable', 'string', 'max:255'],
            'voyageurs.*.est_principal' => ['required', 'boolean'],
            'voyageurs.*.type' => ['sometimes', 'in:adulte,enfant'],
        ]);

        $this->validateVoyageurs($validator, $request);

        $validated = $validator->validate();

        $chevauchant = $this->findChevauchement(
            (int) $validated['appartement_id'],
            $validated['date_arrivee'],
            $validated['date_depart'],
            excludeSejourId: $sejour->id,
        );

        if ($chevauchant) {
            return response()->json([
                'message' => $this->messageChevauchement($chevauchant),
            ], 422);
        }

        $sejour = DB::transaction(function () use ($validated, $sejour) {
            $principal = collect($validated['voyageurs'])
                ->first(fn ($v) => filter_var($v['est_principal'], FILTER_VALIDATE_BOOLEAN));

            $sejour->update([
                'appartement_id' => $validated['appartement_id'],
                'date_arrivee' => $validated['date_arrivee'],
                'date_depart' => $validated['date_depart'],
                'nom_voyageur' => $principal['nom'],
                'plateforme_origine' => $validated['plateforme_origine'] ?? $sejour->plateforme_origine,
                'montant_mad' => $validated['montant_mad'] ?? 0,
            ]);

            $sejour->voyageurs()->delete();
            $this->syncVoyageurs($sejour, $validated['voyageurs']);

            // A new date_arrivee may make the sejour immediately eligible
            // for "en_cours" -- don't wait for the next run of the
            // sejours:activer-en-cours scheduled job to reflect that.
            $this->statutService->activerSiNecessaire($sejour);

            return $sejour;
        });

        return response()->json($sejour->fresh()->load(['appartement', 'voyageurs']));
    }

    /**
     * Shared "exactement un principal, principal adulte, au moins un adulte"
     * validation for the voyageurs payload, used by store() and update().
     */
    private function validateVoyageurs(ValidatorContract $validator, Request $request): void
    {
        $validator->after(function ($validator) use ($request) {
            $voyageurs = collect($request->input('voyageurs', []))->map(fn ($v) => [
                'est_principal' => filter_var($v['est_principal'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'type' => $v['type'] ?? Voyageur::TYPE_ADULTE,
            ]);

            $principaux = $voyageurs->filter(fn ($v) => $v['est_principal']);

            if ($principaux->count() !== 1) {
                $validator->errors()->add('voyageurs', 'Exactement un voyageur doit être désigné comme voyageur principal.');
            } elseif ($principaux->first()['type'] !== Voyageur::TYPE_ADULTE) {
                $validator->errors()->add('voyageurs', 'Le voyageur principal doit être de type adulte.');
            }

            if ($voyageurs->where('type', Voyageur::TYPE_ADULTE)->isEmpty()) {
                $validator->errors()->add('voyageurs', 'Le séjour doit comporter au moins un voyageur adulte.');
            }
        });
    }

    /**
     * Create the voyageurs rows for a sejour from a validated payload.
     */
    private function syncVoyageurs(Sejour $sejour, array $voyageurs): void
    {
        foreach ($voyageurs as $voyageur) {
            $sejour->voyageurs()->create([
                'nom' => $voyageur['nom'],
                'numero_passeport' => $voyageur['numero_passeport'] ?? null,
                'telephone' => $voyageur['telephone'] ?? null,
                'est_principal' => filter_var($voyageur['est_principal'], FILTER_VALIDATE_BOOLEAN),
                'type' => $voyageur['type'] ?? Voyageur::TYPE_ADULTE,
            ]);
        }
    }

    /**
     * Find an existing "a_venir" or "en_cours" sejour on the same
     * appartement whose date range overlaps [dateArrivee, dateDepart).
     * "termine" sejours never block a new booking: their dates are history,
     * not a reservation. $excludeSejourId lets an update() ignore the
     * sejour being edited against itself.
     */
    private function findChevauchement(
        int $appartementId,
        string $dateArrivee,
        string $dateDepart,
        ?int $excludeSejourId = null,
    ): ?Sejour {
        return Sejour::where('appartement_id', $appartementId)
            ->whereIn('statut', [Sejour::STATUT_A_VENIR, Sejour::STATUT_EN_COURS])
            ->when($excludeSejourId, fn ($q) => $q->where('id', '!=', $excludeSejourId))
            ->where('date_arrivee', '<', $dateDepart)
            ->where('date_depart', '>', $dateArrivee)
            ->first();
    }

    private function messageChevauchement(Sejour $chevauchant): string
    {
        return sprintf(
            'Cet appartement est déjà réservé du %s au %s.',
            $chevauchant->date_arrivee->format('Y-m-d'),
            $chevauchant->date_depart->format('Y-m-d'),
        );
    }

    /**
     * Blocks a brand new booking on an appartement with an unresolved
     * maintenance ticket -- mirrors the "Nouveau séjour" form, which hides
     * such appartements from its selector, as a defense-in-depth guard
     * against the API being called directly. Only new()/store() calls
     * this: editing an already-existing sejour on an appartement that
     * later developed a maintenance problem is a different, narrower
     * concern this guard does not attempt to solve.
     */
    private function rejectIfAppartementEnMaintenance(int $appartementId): ?JsonResponse
    {
        $appartement = Appartement::avecStatutCalcule()->find($appartementId);

        if ($appartement && $appartement->statutCalcule() === Appartement::STATUT_MAINTENANCE) {
            return response()->json([
                'message' => "Cet appartement est en maintenance et ne peut pas être réservé tant que le problème n'est pas résolu.",
            ], 422);
        }

        return null;
    }

    /**
     * Confirm the checkout of a sejour and automatically generate its
     * cleaning mission, assigned to an available "menage" agent.
     */
    public function checkout(Sejour $sejour): JsonResponse
    {
        if ($sejour->statut === Sejour::STATUT_TERMINE) {
            return response()->json([
                'message' => 'Ce séjour a déjà été checkouté.',
            ], 422);
        }

        $mission = $this->checkoutService->checkout($sejour);

        return response()->json([
            'sejour' => $sejour->fresh(),
            'mission_menage' => $mission->fresh(['agent', 'produits', 'checklistItems']),
        ]);
    }
}
