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

    public const STATUT_RESOLU_EN_ATTENTE_VALIDATION = 'resolu_en_attente_validation';

    public const STATUT_RESOLU = 'resolu';

    public const STATUT_A_REFAIRE = 'a_refaire';

    protected $fillable = [
        'appartement_id',
        'mission_origine_id',
        'agent_id',
        'description',
        'description_manager',
        'description_manager_audio_url',
        'photo_url',
        'photo_transferee',
        'audio_url',
        'photo_apres',
        'cout_reparation',
        'note_resolution',
        'urgence',
        'statut',
    ];

    protected $casts = [
        'cout_reparation' => 'decimal:2',
        'photo_transferee' => 'boolean',
    ];

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

    /**
     * The maintenance agent's own intermediate photo/audio/note messages to
     * the Manager on this ticket -- distinct from the final resoudre()
     * proof. Chronological (oldest first), unlike refus() which is latest
     * first: a conversation reads top-to-bottom.
     */
    public function messagesAgent(): HasMany
    {
        return $this->hasMany(MessageAgentMaintenance::class)->orderBy('created_at');
    }
}
