<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A recurring charge/service on an appartement (WiFi, Netflix,
 * électricité, ...), historized via date_debut/date_fin: closing a charge
 * (setting date_fin) instead of deleting it preserves the record of what
 * was billed before a montant change, while still letting the monthly
 * relevé pick only whichever charges were actually active that month.
 */
class ChargeAppartement extends Model
{
    use HasFactory;

    public const FREQUENCE_MENSUEL = 'mensuel';
    public const FREQUENCE_ANNUEL = 'annuel';

    public const A_CHARGE_RESTINNOV = 'restinnov';
    public const A_CHARGE_PROPRIETAIRE = 'proprietaire';

    protected $table = 'charges_appartement';

    protected $fillable = [
        'appartement_id',
        'nom_service',
        'montant',
        'frequence',
        'a_charge_de',
        'date_debut',
        'date_fin',
    ];

    protected $casts = [
        'montant' => 'decimal:2',
        'date_debut' => 'date:Y-m-d',
        'date_fin' => 'date:Y-m-d',
    ];

    public function appartement(): BelongsTo
    {
        return $this->belongsTo(Appartement::class);
    }

    /** An annual charge is spread evenly over the year; a monthly one applies as-is. */
    public function montantMensuel(): float
    {
        return $this->frequence === self::FREQUENCE_ANNUEL
            ? round((float) $this->montant / 12, 2)
            : (float) $this->montant;
    }
}
