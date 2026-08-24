<?php

namespace App\Http\Controllers;

use App\Models\Sejour;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CalendrierController extends Controller
{
    /**
     * Monthly occupancy calendar: for each day of the given month, the
     * séjours covering that day (arrivée inclusive, départ exclusive --
     * checkout day itself isn't shown as occupied). Optionally scoped to a
     * single appartement.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mois' => ['required', 'date_format:Y-m'],
            'appartement_id' => ['sometimes', 'integer', 'exists:appartements,id'],
        ]);

        $debut = Carbon::createFromFormat('Y-m-d', $validated['mois'].'-01')->startOfMonth();
        $fin = $debut->copy()->endOfMonth();

        $sejours = Sejour::query()
            ->select('id', 'reference', 'appartement_id', 'nom_voyageur', 'date_arrivee', 'date_depart', 'statut')
            ->with('appartement:id,nom')
            ->when(
                ! empty($validated['appartement_id']),
                fn ($query) => $query->where('appartement_id', $validated['appartement_id']),
            )
            ->where('date_arrivee', '<=', $fin->toDateString())
            ->where('date_depart', '>', $debut->toDateString())
            ->orderBy('date_arrivee')
            ->get();

        $jours = [];
        for ($jour = $debut->copy(); $jour->lte($fin); $jour->addDay()) {
            $dateString = $jour->toDateString();

            $sejoursDuJour = $sejours
                ->filter(fn (Sejour $sejour) => $sejour->date_arrivee->toDateString() <= $dateString
                    && $sejour->date_depart->toDateString() > $dateString)
                ->values()
                ->map(fn (Sejour $sejour) => [
                    'id' => $sejour->id,
                    'reference' => $sejour->reference,
                    'nom_voyageur' => $sejour->nom_voyageur,
                    'statut' => $sejour->statut,
                    'appartement' => $sejour->appartement ? [
                        'id' => $sejour->appartement->id,
                        'nom' => $sejour->appartement->nom,
                    ] : null,
                ]);

            $jours[] = [
                'date' => $dateString,
                'sejours' => $sejoursDuJour,
            ];
        }

        return response()->json([
            'mois' => $validated['mois'],
            'jours' => $jours,
        ]);
    }
}
