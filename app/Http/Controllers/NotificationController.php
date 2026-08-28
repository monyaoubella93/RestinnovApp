<?php

namespace App\Http\Controllers;

use App\Models\MaintenanceAlerte;
use App\Models\MissionMenage;
use App\Models\TicketMaintenance;
use Illuminate\Http\JsonResponse;

class NotificationController extends Controller
{
    /**
     * Lightweight feed for the Manager header's notification bell -- kept
     * separate from GET /api/dashboard (which also computes revenue/cost
     * aggregates) so every screen can poll it cheaply, not just the
     * Dashboard tab. Same "ménages à valider" / "problèmes signalés" shapes
     * as the dashboard endpoint, for a consistent nom+adresse per item.
     */
    public function index(): JsonResponse
    {
        $problemesSignales = TicketMaintenance::query()
            ->select('id', 'appartement_id', 'urgence', 'statut')
            ->whereIn('statut', [
                TicketMaintenance::STATUT_OUVERT,
                TicketMaintenance::STATUT_ASSIGNE,
                TicketMaintenance::STATUT_EN_COURS,
                TicketMaintenance::STATUT_A_REFAIRE,
            ])
            ->with('appartement:id,nom,adresse')
            ->latest()
            ->latest('id')
            ->get();

        $menagesAValider = MissionMenage::query()
            ->select('id', 'sejour_id')
            ->where('statut', MissionMenage::STATUT_EN_ATTENTE_VALIDATION)
            ->with('sejour:id,appartement_id,nom_voyageur', 'sejour.appartement:id,nom,adresse')
            ->latest()
            ->latest('id')
            ->get()
            ->map(fn (MissionMenage $mission) => [
                'id' => $mission->id,
                'sejour_id' => $mission->sejour_id,
                'nom_voyageur' => $mission->sejour?->nom_voyageur,
                'appartement' => $mission->sejour?->appartement,
            ]);

        // Persisted (unlike the two lists above, which are live-computed):
        // "l'agent a commencé" is a one-off event a live query can't
        // express, and the daily retard job needs somewhere to record
        // "already alerted today". Both naturally drop out of this feed
        // once their ticket reaches "resolu", same as problemes_signales
        // above -- no separate mark-as-read step.
        $alertesMaintenance = MaintenanceAlerte::query()
            ->whereHas('ticketMaintenance', fn ($q) => $q->where('statut', '!=', TicketMaintenance::STATUT_RESOLU))
            ->with('ticketMaintenance:id,appartement_id', 'ticketMaintenance.appartement:id,nom,adresse')
            ->latest()
            ->latest('id')
            ->get()
            ->map(fn (MaintenanceAlerte $alerte) => [
                'id' => $alerte->id,
                'niveau' => $alerte->niveau,
                'message' => $alerte->message,
                'ticket_maintenance_id' => $alerte->ticket_maintenance_id,
                'appartement' => $alerte->ticketMaintenance?->appartement,
            ]);

        return response()->json([
            'problemes_signales_count' => $problemesSignales->count(),
            'menages_a_valider_count' => $menagesAValider->count(),
            'alertes_maintenance_count' => $alertesMaintenance->count(),
            'problemes_signales' => $problemesSignales,
            'menages_a_valider' => $menagesAValider,
            'alertes_maintenance' => $alertesMaintenance,
        ]);
    }
}
