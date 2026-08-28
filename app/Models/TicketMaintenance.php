<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TicketMaintenance extends Model
{
    use HasFactory;

    protected $table = 'tickets_maintenance';

    public const URGENCE_BASSE = 'basse';

    public const URGENCE_NORMALE = 'normale';

    public const URGENCE_HAUTE = 'haute';

    public const STATUT_OUVERT = 'ouvert';

    public const STATUT_ASSIGNE = 'assigne';

    // Set by the agent themselves (see TicketMaintenanceController::commencer()),
    // between "assigne" and "resolu_en_attente_validation" -- the
    // "Marquer comme résolu" form only accepts a submission once the
    // ticket is here (or back in "a_refaire", which doesn't need a second
    // "commencer" click).
    public const STATUT_EN_COURS = 'en_cours';

    public const STATUT_RESOLU_EN_ATTENTE_VALIDATION = 'resolu_en_attente_validation';

    public const STATUT_RESOLU = 'resolu';

    public const STATUT_A_REFAIRE = 'a_refaire';

    protected $fillable = [
        'appartement_id',
        'mission_origine_id',
        'agent_id',
        'date_limite_intervention',
        'description',
        'description_manager',
        'description_manager_audio_url',
        'photo_url',
        'photo_transferee',
        'audio_url',
        'photo_apres',
        'cout_reparation',
        'note_resolution',
        'audio_resolution_url',
        'urgence',
        'statut',
    ];

    protected $casts = [
        'date_limite_intervention' => 'date:Y-m-d',
        'cout_reparation' => 'decimal:2',
        'photo_transferee' => 'boolean',
    ];

    // Appended so every raw-model JSON response (index(), assigner(),
    // commencer(), resoudre()...) exposes "en retard" the same way, rather
    // than each caller recomputing "date passed and not yet resolu" itself.
    protected $appends = ['est_en_retard'];

    /**
     * True once the deadline the Manager set has passed and the ticket
     * still isn't "resolu" -- the terminal, Manager-validated statut. A
     * ticket with no deadline (never assigned with one) is never late.
     * The deadline's own day still counts as on-time -- only strictly
     * after it is "dépassé" (date du jour > date limite).
     */
    public function getEstEnRetardAttribute(): bool
    {
        if ($this->date_limite_intervention === null) {
            return false;
        }

        if ($this->statut === self::STATUT_RESOLU) {
            return false;
        }

        return $this->date_limite_intervention->lt(now()->startOfDay());
    }

    protected static function booted(): void
    {
        static::creating(function (TicketMaintenance $ticket) {
            if (empty($ticket->reference)) {
                $ticket->reference = static::nextReference();
            }
        });
    }

    /**
     * Next short reference in the MNT-0001, MNT-0002... sequence -- same
     * convention as Sejour::nextReference() (SEJ-0001...).
     */
    public static function nextReference(): string
    {
        $last = static::query()->whereNotNull('reference')->orderByDesc('id')->value('reference');

        $lastNumber = 0;
        if ($last && preg_match('/(\d+)$/', $last, $matches)) {
            $lastNumber = (int) $matches[1];
        }

        return sprintf('MNT-%04d', $lastNumber + 1);
    }

    public function appartement(): BelongsTo
    {
        return $this->belongsTo(Appartement::class);
    }

    public function missionOrigine(): BelongsTo
    {
        return $this->belongsTo(MissionMenage::class, 'mission_origine_id');
    }

    public function agent(): BelongsTo
    {
        return $this->belongsTo(Utilisateur::class, 'agent_id');
    }

    public function refus(): HasMany
    {
        return $this->hasMany(TicketMaintenanceRefus::class)->latest();
    }

    public function alertes(): HasMany
    {
        return $this->hasMany(MaintenanceAlerte::class);
    }
}
