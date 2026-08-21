<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
}
