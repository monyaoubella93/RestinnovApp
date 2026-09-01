<?php

namespace App\Http\Controllers;

use App\Models\MissionMenage;
use App\Models\ProduitMenageCatalogue;
use App\Models\ProduitMenageSignale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProduitSignaleController extends Controller
{
    /**
     * Display a listing of reported products, optionally filtered by statut.
     */
    public function index(Request $request): JsonResponse
    {
        $query = ProduitMenageSignale::with(['missionMenage.sejour.appartement', 'produitCatalogue'])
            ->latest();

        if ($request->filled('statut')) {
            $query->where('statut', $request->string('statut'));
        }

        return response()->json($query->get());
    }

    /**
     * Validate a reported product: create its catalogue entry, link it back,
     * and attach it to the mission that reported it as "rachete" -- a
     * product the agent found in the field wasn't already in the
     * appartement's stock, so this is definitionally a purchase. The photo
     * the agent took at signalement time is carried over both as the new
     * catalogue entry's reference photo and as this usage's proof-of-
     * purchase photo -- the Manager is never asked to supply another one.
     */
    public function valider(Request $request, ProduitMenageSignale $produitSignale): JsonResponse
    {
        if ($produitSignale->statut !== ProduitMenageSignale::STATUT_EN_ATTENTE) {
            return response()->json([
                'message' => 'Ce produit signalé a déjà été traité.',
            ], 422);
        }

        $validated = $request->validate([
            'nom' => ['required', 'string', 'max:255'],
            'prix' => ['required', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($produitSignale, $validated) {
            $produitCatalogue = ProduitMenageCatalogue::create([
                'nom' => $validated['nom'],
                'prix' => $validated['prix'],
                'photo_url' => $produitSignale->photo_url,
                'actif' => true,
            ]);

            $produitSignale->update([
                'produit_catalogue_id' => $produitCatalogue->id,
                'statut' => ProduitMenageSignale::STATUT_VALIDE,
            ]);

            $produitSignale->missionMenage->produits()->syncWithoutDetaching([
                $produitCatalogue->id => [
                    'type_utilisation' => MissionMenage::TYPE_UTILISATION_RACHETE,
                    'photo_url' => $produitSignale->photo_url,
                    'prix_paye' => $validated['prix'],
                ],
            ]);
        });

        return response()->json($produitSignale->fresh(['produitCatalogue', 'missionMenage']));
    }

    /**
     * Reject a reported product.
     */
    public function rejeter(ProduitMenageSignale $produitSignale): JsonResponse
    {
        if ($produitSignale->statut !== ProduitMenageSignale::STATUT_EN_ATTENTE) {
            return response()->json([
                'message' => 'Ce produit signalé a déjà été traité.',
            ], 422);
        }

        $produitSignale->update(['statut' => ProduitMenageSignale::STATUT_REJETE]);

        return response()->json($produitSignale->fresh());
    }
}
