<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesTicketAccess;
use App\Http\Controllers\Concerns\HasFriendlyUploadMessages;
use App\Models\MaintenanceAlerte;
use App\Models\MessageAgentMaintenance;
use App\Models\MessageAgentMaintenancePhoto;
use App\Models\TicketMaintenance;
use App\Models\TicketMaintenancePhoto;
use App\Models\TicketMaintenanceRefus;
use App\Models\Utilisateur;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class TicketMaintenanceController extends Controller
{
    use AuthorizesTicketAccess;
    use HasFriendlyUploadMessages;

    private const DETAIL_RELATIONS = [
        'appartement',
        'missionOrigine.sejour',
        'agent',
        'refus.manager',
        'messagesAgent.photosSupplementaires',
        'photosSignalement',
        'photosResolution',
    ];

    /**
     * Shared statut/appartement/date-range/search filtering, used by both
     * index() (flat chronological list) and parAppartement() (grouped
     * historique) so the two views always agree on what a given filter
     * combination includes.
     */
    private function applyFilters(Builder $query, array $validated): void
    {
        if (! empty($validated['statut'])) {
            $query->where('statut', $validated['statut']);
        }

        if (! empty($validated['appartement_id'])) {
            $query->where('appartement_id', $validated['appartement_id']);
        }

        if (! empty($validated['date_debut']) || ! empty($validated['date_fin'])) {
            $query->whereHas('missionOrigine.sejour', function ($sejourQuery) use ($validated) {
                if (! empty($validated['date_debut'])) {
                    $sejourQuery->whereDate('date_arrivee', '>=', $validated['date_debut']);
                }
                if (! empty($validated['date_fin'])) {
                    $sejourQuery->whereDate('date_arrivee', '<=', $validated['date_fin']);
                }
            });
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($searchQuery) use ($search) {
                $searchQuery->where('reference', 'like', "%{$search}%")
                    ->orWhereHas('appartement', function ($appartementQuery) use ($search) {
                        $appartementQuery->where('nom', 'like', "%{$search}%");
                    });
            });
        }
    }

    /**
     * Display a listing of maintenance tickets for the Manager -- the single
     * "Tickets de maintenance" screen, used both for the actionable list and
     * for browsing the full history (all filters are optional and combine;
     * omitting statut returns every ticket regardless of statut). Filters:
     * statut, appartement_id, a date range on the *séjour's* date_arrivee
     * (not the ticket's own created_at -- the ticket may have been created
     * or resolved well after the stay), and a free-text search across the
     * ticket reference and the appartement's nom. Regardless of the filter,
     * open/unassigned tickets always sort first, then by urgence (haute
     * first), then most recent.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'statut' => ['sometimes', 'in:ouvert,assigne,en_cours,resolu_en_attente_validation,resolu,a_refaire'],
            'appartement_id' => ['sometimes', 'integer', 'exists:appartements,id'],
            'date_debut' => ['sometimes', 'date'],
            'date_fin' => ['sometimes', 'date'],
            'search' => ['sometimes', 'string', 'max:255'],
        ]);

        $query = TicketMaintenance::with(self::DETAIL_RELATIONS)
            ->orderByRaw("CASE statut WHEN 'ouvert' THEN 0 WHEN 'a_refaire' THEN 1 WHEN 'assigne' THEN 2 ELSE 3 END")
            ->orderByRaw("CASE urgence WHEN 'haute' THEN 0 WHEN 'normale' THEN 1 ELSE 2 END")
            ->latest();

        $this->applyFilters($query, $validated);

        return response()->json($query->get());
    }

    /**
     * The same filterable historique as index(), but grouped by appartement
     * for the Manager's "Historique et récurrence" view: per appartement,
     * the number of tickets and cumulative repair cost within the filtered
     * period, its full ticket list (for the group's expandable detail), and
     * whether it is "récurrent" -- SEUIL_RECURRENCE_TICKETS or more tickets
     * (any statut) within the last FENETRE_RECURRENCE_MOIS months. Unlike
     * the count/cost, "récurrent" deliberately ignores the current
     * statut/date filters: it is a standing trait of the appartement, not a
     * property of whatever slice of history happens to be on screen right
     * now. Appartements are sorted by cumulative cost, most costly first,
     * so the ones worth a closer look surface immediately.
     */
    public function parAppartement(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'statut' => ['sometimes', 'in:ouvert,assigne,en_cours,resolu_en_attente_validation,resolu,a_refaire'],
            'appartement_id' => ['sometimes', 'integer', 'exists:appartements,id'],
            'date_debut' => ['sometimes', 'date'],
            'date_fin' => ['sometimes', 'date'],
            'search' => ['sometimes', 'string', 'max:255'],
        ]);

        $query = TicketMaintenance::with(self::DETAIL_RELATIONS)->latest();
        $this->applyFilters($query, $validated);

        $tickets = $query->get();

        $recurrenceDepuis = now()->subMonths(TicketMaintenance::FENETRE_RECURRENCE_MOIS);
        $recurrentAppartementIds = TicketMaintenance::query()
            ->where('created_at', '>=', $recurrenceDepuis)
            ->selectRaw('appartement_id, count(*) as total')
            ->groupBy('appartement_id')
            ->having('total', '>=', TicketMaintenance::SEUIL_RECURRENCE_TICKETS)
            ->pluck('appartement_id');

        $groupes = $tickets->groupBy('appartement_id')
            ->map(function ($ticketsAppartement, $appartementId) use ($recurrentAppartementIds) {
                $appartement = $ticketsAppartement->first()->appartement;

                return [
                    'appartement' => $appartement ? [
                        'id' => $appartement->id,
                        'nom' => $appartement->nom,
                        'adresse' => $appartement->adresse,
                    ] : null,
                    'tickets_count' => $ticketsAppartement->count(),
                    'cout_cumule' => round((float) $ticketsAppartement->sum('cout_reparation'), 2),
                    'recurrent' => $recurrentAppartementIds->contains($appartementId),
                    'tickets' => $ticketsAppartement->values(),
                ];
            })
            ->sortByDesc('cout_cumule')
            ->values();

        return response()->json($groupes);
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
            'description_manager_audio' => ['nullable', 'file', 'mimes:mp3,wav,ogg,webm,m4a,aac', 'max:5120'],
            // The Manager's explicit, opt-in decision to also hand the
            // ménage agent's original signalement photo down to
            // maintenance -- never automatic.
            'photo_transferee' => ['sometimes', 'boolean'],
            // Optional deadline the Manager sets alongside the agent --
            // powers the "En retard" badge and the daily retard-alert job.
            'date_limite_intervention' => ['nullable', 'date'],
        ], $this->uploadValidationMessages());

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
            'date_limite_intervention' => $validated['date_limite_intervention'] ?? null,
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
            ->whereIn('statut', [
                TicketMaintenance::STATUT_ASSIGNE,
                TicketMaintenance::STATUT_EN_COURS,
                TicketMaintenance::STATUT_A_REFAIRE,
                TicketMaintenance::STATUT_RESOLU_EN_ATTENTE_VALIDATION,
            ])
            ->with(['appartement:id,nom,adresse', 'refus', 'messagesAgent.photosSupplementaires'])
            ->latest()
            ->get()
            ->map(fn (TicketMaintenance $ticket) => [
                'id' => $ticket->id,
                'reference' => $ticket->reference,
                'statut' => $ticket->statut,
                'urgence' => $ticket->urgence,
                'date_limite_intervention' => $ticket->date_limite_intervention?->toDateString(),
                'est_en_retard' => $ticket->est_en_retard,
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
                    'motif_audio_url' => $refus->motif_audio_url,
                    'motif_photo_url' => $refus->motif_photo_url,
                    'vu' => $refus->vu,
                    'date' => $refus->created_at,
                ])->values(),
                'messages_agent' => $ticket->messagesAgent->map(fn (MessageAgentMaintenance $message) => [
                    'id' => $message->id,
                    'photo_url' => $message->photo_url,
                    'photos_supplementaires' => $message->photosSupplementaires->values(),
                    'audio_url' => $message->audio_url,
                    'note' => $message->note,
                    'created_at' => $message->created_at,
                ])->values(),
            ]);

        return response()->json($tickets);
    }

    /**
     * Chronological history of this maintenance agent's own already-resolved
     * (resolu) tickets -- mirrors MissionMenageController::historique() on
     * the ménage side. Explicitly own-agent-only server-side, same as
     * mesTickets(): a "maintenance" caller can never pass another agent's id.
     * Searchable/filterable the same way as the Manager's index()/
     * parAppartement() (reference or appartement nom, appartement_id, and a
     * date range on the séjour's date_arrivee) -- reuses applyFilters() so
     * both sides of the app always agree on what a filter combination
     * includes; only 'statut' from that shared filter set is irrelevant
     * here since it's already hardcoded to "resolu".
     */
    public function mesTicketsHistorique(Request $request): JsonResponse
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

        $validated = $request->validate([
            'appartement_id' => ['sometimes', 'integer', 'exists:appartements,id'],
            'date_debut' => ['sometimes', 'date'],
            'date_fin' => ['sometimes', 'date'],
            'search' => ['sometimes', 'string', 'max:255'],
        ]);

        $query = TicketMaintenance::where('agent_id', $agentId)
            ->where('statut', TicketMaintenance::STATUT_RESOLU)
            ->with(['appartement:id,nom,adresse', 'messagesAgent.photosSupplementaires', 'photosResolution'])
            ->latest();

        $this->applyFilters($query, $validated);

        $tickets = $query->get()->map(fn (TicketMaintenance $ticket) => [
            'id' => $ticket->id,
            'reference' => $ticket->reference,
            'urgence' => $ticket->urgence,
            'description_manager' => $ticket->description_manager,
            'photo_apres' => $ticket->photo_apres,
            'photos_resolution' => $ticket->photosResolution->values(),
            'cout_reparation' => $ticket->cout_reparation !== null ? round((float) $ticket->cout_reparation, 2) : null,
            'note_resolution' => $ticket->note_resolution,
            'appartement' => $ticket->appartement ? [
                'id' => $ticket->appartement->id,
                'nom' => $ticket->appartement->nom,
                'adresse' => $ticket->appartement->adresse,
            ] : null,
            'messages_agent' => $ticket->messagesAgent->map(fn (MessageAgentMaintenance $message) => [
                'id' => $message->id,
                'photo_url' => $message->photo_url,
                'photos_supplementaires' => $message->photosSupplementaires->values(),
                'audio_url' => $message->audio_url,
                'note' => $message->note,
                'created_at' => $message->created_at,
            ])->values(),
        ]);

        return response()->json($tickets);
    }

    /**
     * Mark every refus on this ticket as seen by the maintenance agent --
     * dismisses the unread dot on the agent's "Refusé(e)s" tab. Idempotent.
     */
    public function marquerRefusVu(Request $request, TicketMaintenance $ticketMaintenance): JsonResponse
    {
        $this->authorizeTicketAccess($request, $ticketMaintenance);

        $ticketMaintenance->refus()->where('vu', false)->update(['vu' => true]);

        return response()->json($ticketMaintenance->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * The assigned maintenance agent signals they've actually started the
     * repair -- "assigne" only means the Manager handed it off, not that
     * work is under way. This is the one statut transition the agent
     * triggers themselves without submitting anything, and it's what
     * unlocks resoudre(): a resolution can no longer be submitted straight
     * from "assigne". Notifies the Manager via the same alerts feed the
     * daily retard job writes to.
     */
    public function commencer(Request $request, TicketMaintenance $ticketMaintenance): JsonResponse
    {
        $this->authorizeTicketAccess($request, $ticketMaintenance);

        if ($ticketMaintenance->statut !== TicketMaintenance::STATUT_ASSIGNE) {
            return response()->json([
                'message' => 'Ce ticket n\'est pas assigné.',
            ], 422);
        }

        $ticketMaintenance->update(['statut' => TicketMaintenance::STATUT_EN_COURS]);

        $agentNom = $ticketMaintenance->agent?->nom ?? 'Un agent';
        $appartementNom = $ticketMaintenance->appartement?->nom ?? "l'appartement";

        MaintenanceAlerte::create([
            'ticket_maintenance_id' => $ticketMaintenance->id,
            'niveau' => MaintenanceAlerte::NIVEAU_INFO,
            'message' => "{$agentNom} a commencé le ticket {$ticketMaintenance->reference} - {$appartementNom}",
        ]);

        return response()->json($ticketMaintenance->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * The assigned maintenance agent sends an intermediate photo/audio/note
     * message to the Manager on a ticket they're currently working --
     * distinct from resoudre()'s final proof-of-work: this is for
     * clarifying something or asking a question before or during the
     * repair, not for wrapping it up. At least one of photo/audio/note is
     * required, same pattern as signalerProbleme()/refuserResolution().
     *
     * Unlike every other agent-facing action here, this is explicitly
     * agent-only -- not just "own ticket", but never the Manager, even
     * though the route sits in the same role:maintenance,manager group as
     * its siblings. A Manager has no reason to send themselves a message.
     */
    public function envoyerMessage(Request $request, TicketMaintenance $ticketMaintenance): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== Utilisateur::ROLE_MAINTENANCE || $ticketMaintenance->agent_id !== $user->id) {
            throw new AuthorizationException('Accès refusé.');
        }

        if (! in_array($ticketMaintenance->statut, [TicketMaintenance::STATUT_ASSIGNE, TicketMaintenance::STATUT_EN_COURS, TicketMaintenance::STATUT_A_REFAIRE], true)) {
            return response()->json([
                'message' => 'Ce ticket n\'est pas en cours.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'photos' => ['nullable', 'array'],
            'photos.*' => ['image', 'mimes:jpg,jpeg,png', 'max:10240'],
            'audio' => ['nullable', 'file', 'mimes:mp3,wav,ogg,webm,m4a,aac', 'max:5120'],
            'note' => ['nullable', 'string', 'max:1000'],
        ], $this->uploadValidationMessages());

        $validator->after(function ($validator) use ($request) {
            $hasNote = trim((string) $request->input('note', '')) !== '';

            if (! $request->hasFile('photos') && ! $request->hasFile('audio') && ! $hasNote) {
                $validator->errors()->add('note', 'Ajoutez une photo, un audio ou une note.');
            }
        });

        $validated = $validator->validate();

        $photos = collect($validated['photos'] ?? [])
            ->map(fn ($photo) => $photo->store('tickets-maintenance', 'public'))
            ->values();

        $message = $ticketMaintenance->messagesAgent()->create([
            'photo_url' => $photos->first(),
            'audio_url' => $request->hasFile('audio') ? $request->file('audio')->store('tickets-maintenance', 'public') : null,
            'note' => $validated['note'] ?? null,
        ]);

        foreach ($photos->slice(1) as $photoUrl) {
            $message->photosSupplementaires()->create(['photo_url' => $photoUrl]);
        }

        return response()->json($ticketMaintenance->fresh(self::DETAIL_RELATIONS));
    }

    /**
     * The assigned maintenance agent (checked explicitly server-side, not
     * just via route middleware) marks their ticket resolved: photo proof
     * and repair cost are mandatory, a note is optional. This moves the
     * ticket to "resolu_en_attente_validation" -- the appartement stays
     * blocked in "maintenance" statut until the Manager validates it.
     * Works both once work has actually started ("en_cours", via
     * commencer()) and after a Manager refusal sent it back
     * ("a_refaire") -- a reopened ticket doesn't need a second
     * "commencer" click, the agent is already back on it.
     */
    public function resoudre(Request $request, TicketMaintenance $ticketMaintenance): JsonResponse
    {
        $this->authorizeTicketAccess($request, $ticketMaintenance);

        if (! in_array($ticketMaintenance->statut, [TicketMaintenance::STATUT_EN_COURS, TicketMaintenance::STATUT_A_REFAIRE], true)) {
            return response()->json([
                'message' => 'Ce ticket n\'est pas en cours.',
            ], 422);
        }

        $validated = $request->validate([
            'photos_apres' => ['required', 'array', 'min:1'],
            'photos_apres.*' => ['image', 'mimes:jpg,jpeg,png', 'max:10240'],
            'cout_reparation' => ['required', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:1000'],
        ], $this->uploadValidationMessages());

        $photos = collect($validated['photos_apres'])
            ->map(fn ($photo) => $photo->store('tickets-maintenance', 'public'))
            ->values();

        $ticketMaintenance->update([
            'photo_apres' => $photos->first(),
            'cout_reparation' => $validated['cout_reparation'],
            'note_resolution' => $validated['note'] ?? null,
            'statut' => TicketMaintenance::STATUT_RESOLU_EN_ATTENTE_VALIDATION,
        ]);

        // A resoumission after a refus overwrites photo_apres the same way
        // it always has -- the previous attempt's extra photos shouldn't
        // linger here once they're no longer part of the current proof.
        $ticketMaintenance->photosResolution()->delete();

        foreach ($photos->slice(1) as $photoUrl) {
            $ticketMaintenance->photosResolution()->create([
                'contexte' => TicketMaintenancePhoto::CONTEXTE_RESOLUTION,
                'photo_url' => $photoUrl,
            ]);
        }

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
     * submitted, with a motif that can be text, audio, and/or photo (at
     * least one required). The ticket goes back to "a_refaire" (not closed)
     * -- same agent by default, still blocking the appartement; reassigning
     * to a different agent is a separate, explicit Manager action via
     * assigner(), which is only reachable from "ouvert" -- so a refused
     * ticket keeps its agent unless the Manager deliberately reopens/
     * reassigns it -- and the rejection is recorded so it stays visible in
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

        $validator = Validator::make($request->all(), [
            'motif' => ['nullable', 'string', 'max:1000'],
            'motif_audio' => ['nullable', 'file', 'mimes:mp3,wav,ogg,webm,m4a,aac', 'max:5120'],
            'motif_photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:10240'],
        ], $this->uploadValidationMessages());

        $validator->after(function ($validator) use ($request) {
            $hasMotif = trim((string) $request->input('motif', '')) !== '';

            if (! $request->hasFile('motif_audio') && ! $request->hasFile('motif_photo') && ! $hasMotif) {
                $validator->errors()->add('motif', 'Fournissez un motif texte, audio ou photo.');
            }
        });

        $validated = $validator->validate();

        $motifAudioUrl = $request->hasFile('motif_audio')
            ? $request->file('motif_audio')->store('tickets-maintenance', 'public')
            : null;
        $motifPhotoUrl = $request->hasFile('motif_photo')
            ? $request->file('motif_photo')->store('tickets-maintenance', 'public')
            : null;

        $ticketMaintenance->refus()->create([
            'manager_id' => $request->user()->id,
            'motif' => $validated['motif'] ?? null,
            'motif_audio_url' => $motifAudioUrl,
            'motif_photo_url' => $motifPhotoUrl,
        ]);

        $ticketMaintenance->update([
            'statut' => TicketMaintenance::STATUT_A_REFAIRE,
            'photo_apres' => null,
            'cout_reparation' => null,
            'note_resolution' => null,
        ]);

        return response()->json($ticketMaintenance->fresh(self::DETAIL_RELATIONS));
    }
}
