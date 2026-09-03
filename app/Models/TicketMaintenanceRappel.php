<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TicketMaintenanceRappel extends Model
{
    use HasFactory;

    protected $table = 'ticket_maintenance_rappels';

    protected $fillable = [
        'ticket_maintenance_id',
        'manager_id',
        'message',
    ];

    public function ticketMaintenance(): BelongsTo
    {
        return $this->belongsTo(TicketMaintenance::class);
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(Utilisateur::class, 'manager_id');
    }
}
