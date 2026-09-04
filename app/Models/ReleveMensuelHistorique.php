<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReleveMensuelHistorique extends Model
{
    use HasFactory;

    protected $table = 'releves_mensuels_historiques';

    protected $fillable = [
        'appartement_id',
        'mois',
        'ca',
        'charges',
        'revenu_proprietaire',
        'notre_commission',
    ];

    protected $casts = [
        'ca' => 'decimal:2',
        'charges' => 'decimal:2',
        'revenu_proprietaire' => 'decimal:2',
        'notre_commission' => 'decimal:2',
    ];

    public function appartement(): BelongsTo
    {
        return $this->belongsTo(Appartement::class);
    }
}
