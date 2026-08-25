<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TicketMaintenancePhoto extends Model
{
    use HasFactory;

    public const CONTEXTE_SIGNALEMENT = 'signalement';

    public const CONTEXTE_RESOLUTION = 'resolution';

    protected $fillable = [
        'ticket_maintenance_id',
        'contexte',
        'photo_url',
    ];

    public function ticketMaintenance(): BelongsTo
    {
        return $this->belongsTo(TicketMaintenance::class);
    }
}
