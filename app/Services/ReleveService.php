<?php

namespace App\Services;

use App\Models\Appartement;
use App\Models\ChargeAppartement;
use App\Models\ReleveVerrouillage;
use App\Models\Sejour;
use Carbon\Carbon;

/**
 * Computes an appartement's monthly owner statement ("relevé"), shared by
 * the JSON summary, the PDF invoice, the appartement detail screen's
 * mini-summary, the month-over-month comparison, and the 12-month annual
 * view -- all of them must always agree on the exact same numbers.
 */
class ReleveService
{
    /**
     * The plain financial numbers for one month: gross revenue, cleaning/
     * maintenance costs, charges, net result, and the resulting owner
     * payout -- mandat mode deducts a commission from the net result,
     * sous_location mode pays the fixed rent regardless of how the month
     * performed. Contains no lock or comparison metadata, so it's safe to
     * call repeatedly (e.g. once per month for the annual view) without
     * extra queries.
     */
    public function calculer(Appartement $appartement, string $mois): array
    {
        $debut = Carbon::createFromFormat('Y-m-d', $mois.'-01')->startOfMonth();
        $fin = $debut->copy()->endOfMonth();

        $sejours = Sejour::where('appartement_id', $appartement->id)
            ->where('date_arrivee', '<', $fin->toDateString())
            ->where('date_depart', '>', $debut->toDateString())
            ->with(['missionMenage.produits', 'fraisMaintenance'])
            ->orderBy('date_arrivee')
            ->get();

        $revenusBruts = (float) $sejours->sum('montant_mad');

        $fraisMenageTotal = 0.0;
        $fraisMenageDetail = [];
        foreach ($sejours as $sejour) {
            $mission = $sejour->missionMenage;
            if (! $mission) {
                continue;
            }

            $forfait = (float) $mission->frais_forfait;
            $produitsTotal = $mission->fraisProduitsTotal();
            $fraisMenageTotal += $forfait + $produitsTotal;

            $fraisMenageDetail[] = [
                'sejour_id' => $sejour->id,
                'nom_voyageur' => $sejour->nom_voyageur,
                'forfait' => round($forfait, 2),
                'produits' => $mission->produitsDetail(),
            ];
        }

        $fraisMaintenanceTotal = 0.0;
        $fraisMaintenanceDetail = [];
        foreach ($sejours as $sejour) {
            foreach ($sejour->fraisMaintenance as $frais) {
                $fraisMaintenanceTotal += (float) $frais->prix;
                $fraisMaintenanceDetail[] = [
                    'sejour_id' => $sejour->id,
                    'description' => $frais->description,
                    'prix' => round((float) $frais->prix, 2),
                ];
            }
        }

        // A charge is included if it overlaps the month at all (like the
        // sejour date-range queries above) -- no day-level proration for
        // a charge starting/ending mid-month, only the frequence-based one
        // below. Only "restinnov" charges reduce the propriétaire's payout;
        // "proprietaire" charges are shown on the relevé for information
        // only, since the owner pays and manages those themselves.
        $charges = $appartement->chargesAppartement()
            ->where('date_debut', '<=', $fin->toDateString())
            ->where(fn ($q) => $q->whereNull('date_fin')->orWhere('date_fin', '>=', $debut->toDateString()))
            ->orderBy('date_debut')
            ->get();

        $chargesDetail = $charges->map(fn (ChargeAppartement $charge) => [
            'id' => $charge->id,
            'nom_service' => $charge->nom_service,
            'montant' => round((float) $charge->montant, 2),
            'frequence' => $charge->frequence,
            'a_charge_de' => $charge->a_charge_de,
            'montant_mensuel' => $charge->montantMensuel(),
        ])->values();

        $chargesRestinnovTotal = round($chargesDetail
            ->where('a_charge_de', ChargeAppartement::A_CHARGE_RESTINNOV)
            ->sum('montant_mensuel'), 2);
        $chargesProprietaireTotal = round($chargesDetail
            ->where('a_charge_de', ChargeAppartement::A_CHARGE_PROPRIETAIRE)
            ->sum('montant_mensuel'), 2);

        $depensesTotal = $fraisMenageTotal + $fraisMaintenanceTotal + $chargesRestinnovTotal;
        $resultatNet = $revenusBruts - $depensesTotal;

        // The commission is always taken on the gross chiffre d'affaires
        // (not on the net result after charges) -- matches how RestInnov's
        // real invoices are computed: propriétaire is paid CA - charges -
        // commission, not (CA - charges) x (1 - taux).
        if ($appartement->mode_gestion === Appartement::MODE_GESTION_SOUS_LOCATION) {
            $montantProprietaire = (float) ($appartement->loyer_fixe_mensuel ?? 0);
            $commissionRestinnov = $resultatNet - $montantProprietaire;
        } else {
            $tauxCommission = (float) ($appartement->taux_commission ?? 0);
            $commissionRestinnov = $revenusBruts * $tauxCommission / 100;
            $montantProprietaire = $resultatNet - $commissionRestinnov;
        }

        return [
            'appartement' => [
                'id' => $appartement->id,
                'nom' => $appartement->nom,
                'adresse' => $appartement->adresse,
                'mode_gestion' => $appartement->mode_gestion,
                'taux_commission' => $appartement->taux_commission,
                'loyer_fixe_mensuel' => $appartement->loyer_fixe_mensuel,
                'proprietaire' => $appartement->proprietaire,
            ],
            'mois' => $mois,
            'revenus_bruts' => round($revenusBruts, 2),
            'frais_menage_total' => round($fraisMenageTotal, 2),
            'frais_maintenance_total' => round($fraisMaintenanceTotal, 2),
            'charges_restinnov_total' => $chargesRestinnovTotal,
            'charges_proprietaire_total' => $chargesProprietaireTotal,
            'resultat_net' => round($resultatNet, 2),
            'montant_proprietaire' => round($montantProprietaire, 2),
            'commission_restinnov' => round($commissionRestinnov, 2),
            'sejours' => $sejours->map(fn (Sejour $sejour) => [
                'id' => $sejour->id,
                'nom_voyageur' => $sejour->nom_voyageur,
                'date_arrivee' => $sejour->date_arrivee->toDateString(),
                'date_depart' => $sejour->date_depart->toDateString(),
                'nuitees' => $sejour->date_arrivee->diffInDays($sejour->date_depart),
                'periode' => $this->periodeSejour($sejour->date_arrivee, $sejour->date_depart),
                'montant_mad' => round((float) $sejour->montant_mad, 2),
            ])->values(),
            'frais_menage_detail' => $fraisMenageDetail,
            'frais_maintenance_detail' => $fraisMaintenanceDetail,
            'charges_detail' => $chargesDetail,
        ];
    }

    /**
     * The full monthly relevé shown to the Manager: calculer()'s numbers
     * plus whether this month is already verrouille (already invoiced --
     * shown in the UI as a warning, never as a hard block) and how its
     * resultat_net compares to the previous month's.
     */
    public function build(Appartement $appartement, string $mois): array
    {
        $releve = $this->calculer($appartement, $mois);

        $verrouillage = ReleveVerrouillage::where('appartement_id', $appartement->id)
            ->where('mois', $mois)
            ->first();

        $moisPrecedent = Carbon::createFromFormat('Y-m-d', $mois.'-01')->subMonthNoOverflow()->format('Y-m');
        $resultatNetPrecedent = $this->calculer($appartement, $moisPrecedent)['resultat_net'];

        $releve['verrouille'] = $verrouillage !== null;
        $releve['verrouille_le'] = $verrouillage?->created_at?->toIso8601String();
        $releve['comparaison_mois_precedent'] = [
            'mois' => $moisPrecedent,
            'resultat_net' => $resultatNetPrecedent,
            'variation_pct' => $this->variationPct($releve['resultat_net'], $resultatNetPrecedent),
        ];

        return $releve;
    }

    /**
     * The last 12 months (mois_fin included) of gross revenue and net
     * result, oldest first, for the appartement's annual summary table.
     */
    public function buildAnnuel(Appartement $appartement, string $moisFin): array
    {
        $fin = Carbon::createFromFormat('Y-m-d', $moisFin.'-01');

        $mois = [];
        for ($i = 11; $i >= 0; $i--) {
            $mois[] = $fin->copy()->subMonthsNoOverflow($i)->format('Y-m');
        }

        return array_map(function (string $mois) use ($appartement) {
            $releve = $this->calculer($appartement, $mois);

            return [
                'mois' => $mois,
                'revenus_bruts' => $releve['revenus_bruts'],
                'resultat_net' => $releve['resultat_net'],
            ];
        }, $mois);
    }

    /**
     * Locks a month the first time its PDF relevé is downloaded --
     * idempotent, so regenerating the same month's PDF later never resets
     * verrouille_le back to "now".
     */
    public function verrouiller(Appartement $appartement, string $mois): void
    {
        ReleveVerrouillage::firstOrCreate([
            'appartement_id' => $appartement->id,
            'mois' => $mois,
        ]);
    }

    /**
     * Percentage change of resultat_net versus the previous month. Null
     * when the previous month's result was (essentially) zero, since a
     * percentage change from zero is undefined -- the UI shows no badge in
     * that case rather than a misleading +/-infinity.
     */
    private function variationPct(float $actuel, float $precedent): ?float
    {
        if (abs($precedent) < 0.005) {
            return null;
        }

        return round(($actuel - $precedent) / abs($precedent) * 100, 1);
    }

    /**
     * The invoice's short "Séjour N: dd-dd/mm" label -- the departure date
     * shown is the last night stayed, not the checkout date, and a
     * single-night stay collapses to just its one date.
     */
    private function periodeSejour(Carbon $arrivee, Carbon $depart): string
    {
        $derniereNuit = $depart->copy()->subDay();

        if ($arrivee->isSameDay($derniereNuit)) {
            return $arrivee->format('d/m');
        }

        if ($arrivee->isSameMonth($derniereNuit)) {
            return sprintf('%s-%s/%s', $arrivee->format('d'), $derniereNuit->format('d'), $arrivee->format('m'));
        }

        return sprintf('%s - %s', $arrivee->format('d/m'), $derniereNuit->format('d/m'));
    }
}
