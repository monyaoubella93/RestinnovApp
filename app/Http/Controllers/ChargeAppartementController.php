<?php

namespace App\Http\Controllers;

use App\Models\Appartement;
use App\Models\ChargeAppartement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ChargeAppartementController extends Controller
{
    /**
     * Start a new recurring charge/service on an appartement (WiFi,
     * Netflix, électricité, ...), effective from today unless a different
     * date_debut is given.
     */
    public function store(Request $request, Appartement $appartement): JsonResponse
    {
        $validated = $request->validate([
            'nom_service' => ['required', 'string', 'max:255'],
            'montant' => ['required', 'numeric', 'min:0'],
            'frequence' => ['required', Rule::in([ChargeAppartement::FREQUENCE_MENSUEL, ChargeAppartement::FREQUENCE_ANNUEL])],
            'a_charge_de' => ['required', Rule::in([ChargeAppartement::A_CHARGE_RESTINNOV, ChargeAppartement::A_CHARGE_PROPRIETAIRE])],
            'date_debut' => ['sometimes', 'date'],
            'date_fin' => ['nullable', 'date', 'after_or_equal:date_debut'],
        ]);

        $validated['date_debut'] ??= now()->toDateString();

        $charge = $appartement->chargesAppartement()->create($validated);

        return response()->json($charge, 201);
    }

    /**
     * Update a charge in place (montant/fréquence/payeur), or close it by
     * setting date_fin -- closing preserves the row so the relevé of an
     * earlier month still finds it, instead of deleting it outright.
     */
    public function update(Request $request, ChargeAppartement $chargeAppartement): JsonResponse
    {
        $validated = $request->validate([
            'nom_service' => ['sometimes', 'string', 'max:255'],
            'montant' => ['sometimes', 'numeric', 'min:0'],
            'frequence' => ['sometimes', Rule::in([ChargeAppartement::FREQUENCE_MENSUEL, ChargeAppartement::FREQUENCE_ANNUEL])],
            'a_charge_de' => ['sometimes', Rule::in([ChargeAppartement::A_CHARGE_RESTINNOV, ChargeAppartement::A_CHARGE_PROPRIETAIRE])],
            'date_debut' => ['sometimes', 'date'],
            'date_fin' => ['nullable', 'date'],
        ]);

        $chargeAppartement->update($validated);

        return response()->json($chargeAppartement->fresh());
    }

    /**
     * Permanently remove a charge -- for a mistaken entry. Ending a real
     * service should go through update() (date_fin) instead, to keep it
     * out of future relevés while preserving past ones.
     */
    public function destroy(ChargeAppartement $chargeAppartement): JsonResponse
    {
        $chargeAppartement->delete();

        return response()->json(null, 204);
    }
}
