<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Appartement extends Model
{
    use HasFactory;

    public const STATUT_DISPONIBLE = 'disponible';

    public const STATUT_OCCUPE = 'occupe';

    public const STATUT_EN_MENAGE = 'en_menage';

    public const STATUT_MAINTENANCE = 'maintenance';

    public const MODE_GESTION_MANDAT = 'mandat';

    public const MODE_GESTION_SOUS_LOCATION = 'sous_location';

    protected $fillable = [
        'nom',
        'adresse',
        'statut',
        'photo_principale',
        'agent_habituel_id',
        'proprietaire_id',
        'mode_gestion',
        'taux_commission',
        'loyer_fixe_mensuel',
    ];

    protected $casts = [
        'taux_commission' => 'decimal:2',
        'loyer_fixe_mensuel' => 'decimal:2',
    ];

    public function sejours(): HasMany
    {
        return $this->hasMany(Sejour::class);
    }

    public function proprietaire(): BelongsTo
    {
        return $this->belongsTo(Proprietaire::class);
    }

    public function ticketsMaintenance(): HasMany
    {
        return $this->hasMany(TicketMaintenance::class);
    }

    /**
     * Adds the `a_un_sejour_en_cours`, `a_une_mission_menage_active` and
     * `a_un_ticket_maintenance_ouvert` booleans via EXISTS subqueries (works
     * alongside a custom select(), unlike an eager-loaded relation). The
     * stored `statut` column is only ever the default set at creation -- it
     * is never authoritative for "occupé"/"en_menage"/"maintenance", which
     * must always be derived from live sejours/mission_menage/tickets data
     * at read time. See statutCalcule().
     */
    public function scopeAvecStatutCalcule(Builder $query): Builder
    {
        return $query->withExists([
            'sejours as a_un_sejour_en_cours' => fn ($q) => $q->where('statut', Sejour::STATUT_EN_COURS),
            'sejours as a_une_mission_menage_active' => fn ($q) => $q->whereHas(
                'missionMenage',
                fn ($q2) => $q2->whereIn('statut', [MissionMenage::STATUT_A_FAIRE, MissionMenage::STATUT_EN_COURS, MissionMenage::STATUT_EN_ATTENTE_VALIDATION]),
            ),
            'ticketsMaintenance as a_un_ticket_maintenance_ouvert' => fn ($q) => $q->whereIn(
                'statut',
                [
                    TicketMaintenance::STATUT_OUVERT,
                    TicketMaintenance::STATUT_ASSIGNE,
                    TicketMaintenance::STATUT_EN_COURS,
                    TicketMaintenance::STATUT_RESOLU_EN_ATTENTE_VALIDATION,
                    TicketMaintenance::STATUT_A_REFAIRE,
                ],
            ),
        ]);
    }

    /**
     * The appartement's real statut, derived from its sejours/missions/
     * tickets rather than read from the (never-updated) `statut` column.
     * Requires the model to have been loaded via the avecStatutCalcule()
     * scope.
     *
     * Order matters: an unresolved maintenance problem takes priority over
     * everything else -- no booking should happen while something is
     * broken, even if a guest currently happens to be present or a cleaning
     * mission is ongoing. Below that, "occupé" (a guest physically present)
     * takes priority over "en_menage".
     */
    public function statutCalcule(): string
    {
        if ($this->a_un_ticket_maintenance_ouvert) {
            return self::STATUT_MAINTENANCE;
        }

        if ($this->a_un_sejour_en_cours) {
            return self::STATUT_OCCUPE;
        }

        if ($this->a_une_mission_menage_active) {
            return self::STATUT_EN_MENAGE;
        }

        return self::STATUT_DISPONIBLE;
    }

    public function checklistModeles(): BelongsToMany
    {
        return $this->belongsToMany(ChecklistModele::class, 'appartement_checklist_modele')
            ->orderBy('appartement_checklist_modele.id');
    }

    public function agentHabituel(): BelongsTo
    {
        return $this->belongsTo(Utilisateur::class, 'agent_habituel_id');
    }
}
