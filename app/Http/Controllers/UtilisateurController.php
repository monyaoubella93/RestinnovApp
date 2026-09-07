<?php

namespace App\Http\Controllers;

use App\Models\Appartement;
use App\Models\Utilisateur;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UtilisateurController extends Controller
{
    /**
     * Display a listing of utilisateurs, optionally filtered by role and/or
     * a name search, with the appartement/mission counts needed by the
     * "Liste des agents" screen. Inactive agents are excluded by default --
     * they must stay out of every selection list (agent habituel, automatic
     * mission assignment) -- unless inclure_inactifs is explicitly set, which
     * the agents management screen uses to also show deactivated agents.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'role' => ['sometimes', 'in:menage,maintenance,manager'],
            'search' => ['sometimes', 'string'],
            'inclure_inactifs' => ['sometimes', 'boolean'],
        ]);

        $query = Utilisateur::query()
            ->withCount([
                'appartementsHabituels as appartements_habituel_count',
                'missionMenages as mission_menages_count',
                'ticketsMaintenance as tickets_maintenance_count',
            ])
            ->orderBy('nom');

        if (! empty($validated['role'])) {
            $query->where('role', $validated['role']);
        }

        if (! empty($validated['search'])) {
            $query->where('nom', 'like', '%'.$validated['search'].'%');
        }

        if (! $request->boolean('inclure_inactifs')) {
            $query->where('actif', true);
        }

        return response()->json($query->get());
    }

    /**
     * Store a newly created utilisateur (agent account), optionally assigning
     * it as the agent_habituel of a set of existing appartements.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nom' => ['required', 'string', 'max:255'],
            'role' => ['required', 'in:menage,maintenance,manager'],
            'telephone' => ['nullable', 'string', 'max:255'],
            'adresse' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'min:6'],
            'appartement_ids' => ['sometimes', 'array'],
            'appartement_ids.*' => ['integer', 'exists:appartements,id'],
        ]);

        $appartementIds = $validated['appartement_ids'] ?? [];
        unset($validated['appartement_ids']);

        if (isset($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        }

        $utilisateur = DB::transaction(function () use ($validated, $appartementIds) {
            $utilisateur = Utilisateur::create($validated);

            if (! empty($appartementIds)) {
                Appartement::whereIn('id', $appartementIds)->update([
                    'agent_habituel_id' => $utilisateur->id,
                ]);
            }

            return $utilisateur;
        });

        return response()->json($utilisateur, 201);
    }

    /**
     * Update an existing utilisateur's profile. The password only changes
     * when a new one is actually provided -- an empty/absent value leaves
     * the current hash untouched.
     */
    public function update(Request $request, Utilisateur $utilisateur): JsonResponse
    {
        $validated = $request->validate([
            'nom' => ['required', 'string', 'max:255'],
            'telephone' => ['nullable', 'string', 'max:255', Rule::unique('utilisateurs', 'telephone')->ignore($utilisateur->id)],
            'adresse' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'min:6'],
        ]);

        if ($request->filled('password')) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $utilisateur->update($validated);

        return response()->json($utilisateur->fresh());
    }

    /**
     * Deactivate an agent: it disappears from every selection list (agent
     * habituel, automatic mission assignment) but stays visible in the
     * history of its past missions/appartements.
     */
    public function desactiver(Utilisateur $utilisateur): JsonResponse
    {
        $utilisateur->update(['actif' => false]);

        return response()->json($utilisateur->fresh());
    }

    /**
     * Reactivate a previously deactivated agent.
     */
    public function reactiver(Utilisateur $utilisateur): JsonResponse
    {
        $utilisateur->update(['actif' => true]);

        return response()->json($utilisateur->fresh());
    }

    /**
     * Permanently delete an utilisateur. Only allowed when it never had any
     * history (no mission_menage ever assigned, never set as an
     * appartement's agent_habituel, no ticket_maintenance ever assigned) --
     * an agent with history must be deactivated instead, so its past
     * missions/appartements/tickets keep a valid reference.
     */
    public function destroy(Utilisateur $utilisateur): JsonResponse
    {
        if (
            $utilisateur->missionMenages()->exists()
            || $utilisateur->appartementsHabituels()->exists()
            || $utilisateur->ticketsMaintenance()->exists()
        ) {
            return response()->json([
                'message' => 'Cet agent a un historique (missions, appartements ou tickets assignés) et ne peut pas être supprimé. Désactivez-le à la place.',
            ], 422);
        }

        $utilisateur->delete();

        return response()->json(null, 204);
    }
}
