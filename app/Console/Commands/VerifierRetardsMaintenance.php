<?php

namespace App\Console\Commands;

use App\Models\MaintenanceAlerte;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class VerifierRetardsMaintenance extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'maintenance:verifier-retards';

    /**
     * The console command description.
     */
    protected $description = 'Alerte le Manager sur les tickets de maintenance qui approchent ou dépassent leur date limite, ou dont l\'appartement attend un voyageur';

    /**
     * Runs daily against every ticket that isn't "resolu" (the terminal,
     * Manager-validated statut -- "resolu_en_attente_validation" still
     * needs watching). For each one, evaluates the three conditions below
     * and -- if any is true -- writes at most one MaintenanceAlerte,
     * skipping entirely if one was already written today for that ticket
     * (so running the command twice, or several conditions being true at
     * once, never produces more than one notification per ticket per
     * day):
     *
     *   - Critique: the appartement has an upcoming séjour (arriving
     *     within the 1-day ménage buffer) regardless of the ticket's own
     *     deadline -- the urgency here comes from the next guest, not
     *     from whatever date the Manager originally set.
     *   - Urgente: the deadline has passed (strictly -- its own day still
     *     counts as on-time, mirrors TicketMaintenance::getEstEnRetardAttribute()).
     *   - Rappel: the deadline is tomorrow and the agent hasn't started
     *     yet (statut still "ouvert" or "assigne").
     *
     * Priority when several are true for the same ticket: critique >
     * urgente > rappel.
     */
    public function handle(): int
    {
        $aujourdhui = Carbon::today();
        $demain = $aujourdhui->copy()->addDay();

        $tickets = TicketMaintenance::where('statut', '!=', TicketMaintenance::STATUT_RESOLU)
            ->with(['appartement', 'agent'])
            ->get();

        $count = 0;

        foreach ($tickets as $ticket) {
            $dejaAlerteAujourdhui = MaintenanceAlerte::where('ticket_maintenance_id', $ticket->id)
                ->whereIn('niveau', [MaintenanceAlerte::NIVEAU_RAPPEL, MaintenanceAlerte::NIVEAU_URGENTE, MaintenanceAlerte::NIVEAU_CRITIQUE])
                ->whereDate('created_at', $aujourdhui)
                ->exists();

            if ($dejaAlerteAujourdhui) {
                continue;
            }

            $appartementNom = $ticket->appartement?->nom ?? "l'appartement";

            $unSejourArriveBientot = $ticket->appartement_id !== null && Sejour::where('appartement_id', $ticket->appartement_id)
                ->where('statut', Sejour::STATUT_A_VENIR)
                ->whereDate('date_arrivee', '<=', $demain)
                ->exists();

            if ($unSejourArriveBientot) {
                MaintenanceAlerte::create([
                    'ticket_maintenance_id' => $ticket->id,
                    'niveau' => MaintenanceAlerte::NIVEAU_CRITIQUE,
                    'message' => "Le ticket {$ticket->reference} n'est pas résolu et un voyageur arrive bientôt à {$appartementNom} — intervention prioritaire requise.",
                ]);
                $count++;

                continue;
            }

            if ($ticket->est_en_retard) {
                $agentNom = $ticket->agent?->nom ?? "l'agent assigné";

                MaintenanceAlerte::create([
                    'ticket_maintenance_id' => $ticket->id,
                    'niveau' => MaintenanceAlerte::NIVEAU_URGENTE,
                    'message' => "Le ticket {$ticket->reference} est en retard, contactez l'agent {$agentNom}.",
                ]);
                $count++;

                continue;
            }

            $agentPasEncoreCommence = in_array($ticket->statut, [
                TicketMaintenance::STATUT_OUVERT,
                TicketMaintenance::STATUT_ASSIGNE,
            ], true);

            $echeanceDemain = $ticket->date_limite_intervention !== null
                && $ticket->date_limite_intervention->isSameDay($demain);

            if ($agentPasEncoreCommence && $echeanceDemain) {
                MaintenanceAlerte::create([
                    'ticket_maintenance_id' => $ticket->id,
                    'niveau' => MaintenanceAlerte::NIVEAU_RAPPEL,
                    'message' => "Le ticket {$ticket->reference} arrive à échéance demain et l'agent n'a pas encore commencé.",
                ]);
                $count++;
            }
        }

        $this->info("{$count} alerte(s) de retard créée(s).");

        return self::SUCCESS;
    }
}
