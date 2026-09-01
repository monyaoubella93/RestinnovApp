<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProduitMenageSignale extends Model
{
    use HasFactory;

    protected $table = 'produits_menage_signales';

    public const STATUT_EN_ATTENTE = 'en_attente';
    public const STATUT_VALIDE = 'valide';
    public const STATUT_REJETE = 'rejete';

    protected $fillable = [
        'mission_menage_id',
        'photo_url',
        'note',
        'prix',
        'photo_ticket_url',
        'statut',
        'produit_catalogue_id',
    ];

    protected $casts = [
        'prix' => 'decimal:2',
    ];

    public function missionMenage(): BelongsTo
    {
        return $this->belongsTo(MissionMenage::class);
    }

    public function produitCatalogue(): BelongsTo
    {
        return $this->belongsTo(ProduitMenageCatalogue::class, 'produit_catalogue_id');
    }
}
