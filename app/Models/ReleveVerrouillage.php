<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Marks a given appartement/mois as already invoiced: created automatically
 * the first time its PDF relevé is downloaded. The row's existence alone is
 * the lock -- there is no "brouillon" state to store, a month is either
 * verrouille (a row exists) or not (no row). Never deleted or updated once
 * created, so verrouille_le always reflects the *first* time the owner was
 * billed for that month, even if the PDF is regenerated afterwards.
 */
class ReleveVerrouillage extends Model
{
    protected $fillable = [
        'appartement_id',
        'mois',
    ];

    public function appartement(): BelongsTo
    {
        return $this->belongsTo(Appartement::class);
    }
}
