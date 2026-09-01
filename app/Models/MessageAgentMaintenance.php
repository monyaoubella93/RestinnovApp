<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MessageAgentMaintenance extends Model
{
    protected $table = 'messages_agent_maintenance';

    protected $fillable = [
        'ticket_maintenance_id',
        'photo_url',
        'audio_url',
        'note',
    ];

    public function ticketMaintenance(): BelongsTo
    {
        return $this->belongsTo(TicketMaintenance::class);
    }

    /**
     * photo_url stays this message's primary/first photo; any further
     * photos attached to the same message land here.
     */
    public function photosSupplementaires(): HasMany
    {
        return $this->hasMany(MessageAgentMaintenancePhoto::class);
    }
}
