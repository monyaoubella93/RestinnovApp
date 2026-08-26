<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A manually-entered monthly charge on an appartement's relevé (WiFi,
 * électricité, pressing, ...) -- distinct from frais de ménage (tied to a
 * mission) and frais de maintenance (tied to a sejour), since these are
 * recurring costs the manager enters once per appartement/mois rather than
 * costs the app derives from mission/sejour activity.
 */
class ChargeAppartement extends Model
{
    use HasFactory;

    protected $table = 'charges_appartement';

    protected $fillable = [
        'appartement_id',
        'mois',
        'description',
        'quantite',
        'prix_unitaire',
    ];

    protected $casts = [
        'quantite' => 'decimal:2',
        'prix_unitaire' => 'decimal:2',
    ];

    public function appartement(): BelongsTo
    {
        return $this->belongsTo(Appartement::class);
    }
}
