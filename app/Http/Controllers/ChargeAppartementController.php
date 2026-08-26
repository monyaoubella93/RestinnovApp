<?php

namespace App\Http\Controllers;

use App\Models\Appartement;
use App\Models\ChargeAppartement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChargeAppartementController extends Controller
{
    /**
     * Add a manual monthly charge to an appartement's relevé (WiFi,
     * électricité, pressing, ...) -- anything beyond the ménage/maintenance
     * costs the app already derives from mission/sejour activity.
     */
    public function store(Request $request, Appartement $appartement): JsonResponse
    {
        $validated = $request->validate([
            'mois' => ['required', 'date_format:Y-m'],
            'description' => ['required', 'string', 'max:255'],
            'quantite' => ['required', 'numeric', 'min:0.01'],
            'prix_unitaire' => ['required', 'numeric', 'min:0'],
        ]);

        $charge = $appartement->chargesAppartement()->create($validated);

        return response()->json($charge, 201);
    }

    /**
     * Remove a manual monthly charge.
     */
    public function destroy(ChargeAppartement $chargeAppartement): JsonResponse
    {
        $chargeAppartement->delete();

        return response()->json(null, 204);
    }
}
