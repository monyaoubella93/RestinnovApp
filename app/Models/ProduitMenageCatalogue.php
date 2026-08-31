<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ProduitMenageCatalogue extends Model
{
    use HasFactory;

    protected $table = 'produits_menage_catalogue';

    protected $fillable = [
        'nom',
        'nom_ar',
        'prix',
        'photo_url',
        'actif',
    ];

    protected $casts = [
        'prix' => 'decimal:2',
        'actif' => 'boolean',
    ];

    public function missionMenages(): BelongsToMany
    {
        return $this->belongsToMany(
            MissionMenage::class,
            'mission_menage_produits',
            'produit_catalogue_id',
            'mission_menage_id',
        );
    }
}
