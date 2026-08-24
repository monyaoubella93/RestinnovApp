<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesTicketAccess;
use App\Models\TicketMaintenance;
use App\Models\TicketMaintenanceRefus;
use App\Models\Utilisateur;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class TicketMaintenanceController extends Controller
{
    use AuthorizesTicketAccess;

    private const DETAIL_RELATIONS = ['appartement', 'missionOrigine.sejour', 'agent', 'refus.manager'];

    /**
     * Display a listing of maintenance tickets for the Manager, optionally
     * filtered by statut -- omitting it returns every ticket regardless of
     * statut, which is what powers the "Historique des tickets" view.
     * Regardless of the filter, open/unassigned tickets always sort first,
     * then by urgence (haute first), then most recent.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'statut' => ['sometimes', 'in:ouvert,assigne,resolu_en_attente_validation,resolu,a_refaire'],
        ]);

        $query = TicketMaintenance::with(self::DETAIL_RELATIONS)
            ->orderByRaw("CASE statut WHEN 'ouvert' THEN 0 WHEN 'a_refaire' THEN 1 WHEN 'assigne' THEN 2 ELSE 3 END")
            ->orderByRaw("CASE urgence WHEN 'haute' THEN 0 WHEN 'normale' THEN 1 ELSE 2 END")
            ->latest();

        if (! empty($validated['statut'])) {
            $query->where('statut', $validated['statut']);
        }

        return response()->json($query->get());
    }

    /**
     * Manager assigns an open ticket to an active maintenance agent. The
     * agent's own workspace (built separately) picks it up from there.
     */
    public function assigner(Request $request, TicketMaintenance $ticketMaintenance): JsonResponse
    {
        if ($ticketMaintenance->statut !== TicketMaintenance::STATUT_OUVERT) {
            return response()->json([
                'message' => 'Ce ticket a déjà été assigné ou résolu.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'agent_id' => [
                'required',
                Rule::exists('utilisateurs', 'id')->where('role', Utilisateur::ROLE_MAINTENANCE)->where('actif', true),
            ],
            // The instruction the maintenance agent will actually see on
            // their ticket detail -- the ménage agent's own description/
            // photo/audio stay Manager-only, never shown to maintenance.
            // Either written or spoken works, at least one is required.
            'description_manager' => ['nullable', 'string', 'max:1000'],
            'description_manager_audio' => ['nullable', 'file', 'mimes:mp3,wav,ogg,webm,m4a,aac', 'max:10240'],
            // The Manager's explicit, opt-in decision to also hand the
            // ménage agent's original signalement photo down to
            // maintenance -- never automatic.
            'photo_transferee' => ['sometimes', 'boolean'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $hasDescription = trim((string) $request->input('description_manager', '')) !== '';

            if (! $request->hasFile('description_manager_audio') && ! $hasDescription) {
                $validator->errors()->add(
                    'description_manager',
                    'Fournissez une description écrite ou un message audio pour l\'agent.',
                );
            }
        });

        $validated = $validator->validate();

        $audioUrl = $request->hasFile('description_manager_audio')
            ? $request->file('description_manager_audio')->store('tickets-maintenance', 'public')
            : null;

        $ticketMaintenance->update([
            'agent_id' => $validated['agent_id'],
            'description_manager' => $validated['description_manager'] ?? null,
            'description_manager_audio_url' => $audioUrl,
            'photo_transferee' => filter_var($validated['photo_transferee'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'statut' => TicketMaintenance::STATUT_ASSIGNE,
        ]);

        return response()->json($ticketMaintenance->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * The maintenance agent's own workspace: tickets currently on their
     * plate -- "assigne" (newly handed off) or "a_refaire" (a resolution
     * the Manager sent back for rework, same agent). The response is an
     * explicit whitelist, never the raw model: the ménage agent's original
     * `description`/`photo_url`/`audio_url` signalement fields must never
     * reach a maintenance agent, only the Manager-authored
     * `description_manager` may. The refus history lets the agent see why
     * a resolution was rejected.
     */
    public function mesTickets(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role === Utilisateur::ROLE_MAINTENANCE) {
            $agentId = $user->id;
        } else {
            $validated = $request->validate([
                'agent_id' => ['required', 'integer', 'exists:utilisateurs,id'],
            ]);
            $agentId = $validated['agent_id'];
        }

        $tickets = TicketMaintenance::where('agent_id', $agentId)
            ->whereIn('statut', [TicketMaintenance::STATUT_ASSIGNE, TicketMaintenance::STATUT_A_REFAIRE])
            ->with(['appartement:id,nom,adresse', 'refus'])
            ->orderBy('created_at')
            ->get()
            ->map(fn (TicketMaintenance $ticket) => [
                'id' => $ticket->id,
                'reference' => $ticket->reference,
                'statut' => $ticket->statut,
                'urgence' => $ticket->urgence,
                'description_manager' => $ticket->description_manager,
                'description_manager_audio_url' => $ticket->description_manager_audio_url,
                // The ménage agent's original signalement photo only
                // reaches the maintenance agent if the Manager explicitly
                // opted to transfer it -- never the ménage agent's own
                // audio_url, which stays Manager-only regardless.
                'photo_url' => $ticket->photo_transferee ? $ticket->photo_url : null,
                'appartement' => $ticket->appartement ? [
                    'id' => $ticket->appartement->id,
                    'nom' => $ticket->appartement->nom,
                    'adresse' => $ticket->appartement->adresse,
                ] : null,
                'refus' => $ticket->refus->map(fn (TicketMaintenanceRefus $refus) => [
                    'motif' => $refus->motif,
                    'date' => $refus->created_at,
                ])->values(),
            ]);

        return response()->json($tickets);
    }

    /**
     * The assigned maintenance agent (checked explicitly server-side, not
     * just via route middleware) marks their ticket resolved: photo proof
     * and repair cost are mandatory, a note is optional. This moves the
     * ticket to "resolu_en_attente_validation" -- the appartement stays
     * blocked in "maintenance" statut until the Manager validates it.
     * Works both the first time (from "assigne") and after a Manager
     * refusal sent it back (from "a_refaire").
     */
    public function resoudre(Request $request, TicketMaintenance $ticketMaintenance): JsonResponse
    {
        $this->authorizeTicketAccess($request, $ticketMaintenance);

        if (! in_array($ticketMaintenance->statut, [TicketMaintenance::STATUT_ASSIGNE, TicketMaintenance::STATUT_A_REFAIRE], true)) {
            return response()->json([
                'message' => 'Ce ticket n\'est pas assigné.',
            ], 422);
        }

        $validated = $request->validate([
            'photo_apres' => ['required', 'image', 'mimes:jpg,jpeg,png', 'max:5120'],
            'cout_reparation' => ['required', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:1000'],
            // Optional voice note explaining the fix, alongside the
            // mandatory photo_apres -- same mime allowlist as the other
            // audio uploads on this controller (description_manager_audio).
            'audio_resolution' => ['nullable', 'file', 'mimes:mp3,wav,ogg,webm,m4a,aac', 'max:10240'],
        ]);

        $photoApresUrl = $request->file('photo_apres')->store('tickets-maintenance', 'public');
        $audioResolutionUrl = $request->hasFile('audio_resolution')
            ? $request->file('audio_resolution')->store('tickets-maintenance', 'public')
            : null;

        $ticketMaintenance->update([
            'photo_apres' => $photoApresUrl,
            'cout_reparation' => $validated['cout_reparation'],
            'note_resolution' => $validated['note'] ?? null,
            'audio_resolution_url' => $audioResolutionUrl,
            'statut' => TicketMaintenance::STATUT_RESOLU_EN_ATTENTE_VALIDATION,
        ]);

        return response()->json($ticketMaintenance->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Manager-only: validates a resolution the maintenance agent has
     * submitted, moving it from "resolu_en_attente_validation" to
     * "resolu". This is the precise moment the appartement can go back to
     * "disponible" (its statut is derived live from ticket statuts, see
     * Appartement::statutCalcule()).
     */
    public function validerResolution(TicketMaintenance $ticketMaintenance): JsonResponse
    {
        if ($ticketMaintenance->statut !== TicketMaintenance::STATUT_RESOLU_EN_ATTENTE_VALIDATION) {
            return response()->json([
                'message' => 'Cette résolution n\'est pas en attente de validation.',
            ], 422);
        }

        $ticketMaintenance->update(['statut' => TicketMaintenance::STATUT_RESOLU]);

        return response()->json($ticketMaintenance->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * Manager-only: rejects a resolution the maintenance agent has
     * submitted, with a mandatory motif. The ticket goes back to
     * "a_refaire" (not closed) -- same agent, still blocking the
     * appartement -- and the rejection is recorded so it stays visible in
     * the ticket's history even after several successive refusals. The
     * previously-submitted resolution proof is cleared: the agent's next
     * resoudre() call must provide fresh ones.
     */
    public function refuserResolution(Request $request, TicketMaintenance $ticketMaintenance): JsonResponse
    {
        if ($ticketMaintenance->statut !== TicketMaintenance::STATUT_RESOLU_EN_ATTENTE_VALIDATION) {
            return response()->json([
                'message' => 'Cette résolution n\'est pas en attente de validation.',
            ], 422);
        }

        $validated = $request->validate([
            'motif' => ['required', 'string', 'max:1000'],
        ]);

        $ticketMaintenance->refus()->create([
            'manager_id' => $request->user()->id,
            'motif' => $validated['motif'],
        ]);

        $ticketMaintenance->update([
            'statut' => TicketMaintenance::STATUT_A_REFAIRE,
            'photo_apres' => null,
            'cout_reparation' => null,
            'note_resolution' => null,
            'audio_resolution_url' => null,
        ]);

        return response()->json($ticketMaintenance->fresh(self::DETAIL_RELATIONS));
    }
}
