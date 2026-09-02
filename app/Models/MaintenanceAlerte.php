<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MaintenanceAlerte extends Model
{
    use HasFactory;

    protected $table = 'maintenance_alertes';

    // "info" is the one-off "l'agent a commencé" event, fired directly by
    // the controller. The other three are the daily retard-check job's
    // outcome for a ticket -- at most one of them per ticket per day, see
    // App\Console\Commands\VerifierRetardsMaintenance.
    public const NIVEAU_INFO = 'info';

    public const NIVEAU_RAPPEL = 'rappel';

    public const NIVEAU_URGENTE = 'urgente';

    public const NIVEAU_CRITIQUE = 'critique';

    protected $fillable = [
        'ticket_maintenance_id',
        'niveau',
        'message',
    ];

    public function ticketMaintenance(): BelongsTo
    {
        return $this->belongsTo(TicketMaintenance::class);
    }
}
