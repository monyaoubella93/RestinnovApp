<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\HasFriendlyUploadMessages;
use App\Models\ChecklistModele;
use App\Models\ChecklistModeleItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChecklistModeleItemController extends Controller
{
    use HasFriendlyUploadMessages;

    /**
     * Add a new item at the end of a checklist modele. The reference photo
     * is optional -- shown to the agent as guidance on the mission's
     * checklist, distinct from the agent's own proof-of-work photo.
     */
    public function store(Request $request, ChecklistModele $checklistModele): JsonResponse
    {
        $validated = $request->validate([
            'libelle' => ['required', 'string', 'max:255'],
            'photo' => ['sometimes', 'image', 'mimes:jpg,jpeg,png', 'max:10240'],
        ], $this->uploadValidationMessages());

        $nextOrdre = ($checklistModele->items()->max('ordre') ?? -1) + 1;

        $item = $checklistModele->items()->create([
            'libelle' => $validated['libelle'],
            'photo_url' => $request->hasFile('photo') ? $request->file('photo')->store('checklist-modele-items', 'public') : null,
            'ordre' => $nextOrdre,
        ]);

        return response()->json($item, 201);
    }

    /**
     * Move an item one position up or down within its checklist modele, by
     * swapping its `ordre` with its immediate neighbour in that direction.
     */
    public function deplacer(Request $request, ChecklistModeleItem $checklistModeleItem): JsonResponse
    {
        $validated = $request->validate([
            'direction' => ['required', 'in:haut,bas'],
        ]);

        $versLeHaut = $validated['direction'] === 'haut';

        $voisin = ChecklistModeleItem::where('checklist_modele_id', $checklistModeleItem->checklist_modele_id)
            ->where('ordre', $versLeHaut ? '<' : '>', $checklistModeleItem->ordre)
            ->orderBy('ordre', $versLeHaut ? 'desc' : 'asc')
            ->first();

        if ($voisin) {
            $ordreItem = $checklistModeleItem->ordre;
            $checklistModeleItem->update(['ordre' => $voisin->ordre]);
            $voisin->update(['ordre' => $ordreItem]);
        }

        return response()->json(
            ChecklistModeleItem::where('checklist_modele_id', $checklistModeleItem->checklist_modele_id)
                ->orderBy('ordre')
                ->get(),
        );
    }

    /**
     * Remove an item from a checklist modele. Never affects checklist items
     * already generated on existing missions -- those are copies, not
     * references (see SejourCheckoutService).
     */
    public function destroy(ChecklistModeleItem $checklistModeleItem): JsonResponse
    {
        $checklistModeleItem->delete();

        return response()->json(null, 204);
    }
}
