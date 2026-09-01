<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MessageAgentMaintenancePhoto extends Model
{
    use HasFactory;

    protected $fillable = [
        'message_agent_maintenance_id',
        'photo_url',
    ];

    public function messageAgentMaintenance(): BelongsTo
    {
        return $this->belongsTo(MessageAgentMaintenance::class);
    }
}
