<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

class MissionMenage extends Model
{
    use HasFactory;

    public const STATUT_A_FAIRE = 'a_faire';

    public const STATUT_EN_COURS = 'en_cours';

    public const STATUT_EN_ATTENTE_VALIDATION = 'en_attente_validation';

    public const STATUT_CONFORME = 'conforme';

    public const STATUT_NON_CONFORME = 'non_conforme';

    /**
     * A catalogue product checked as already present in the appartement --
     * free, doesn't count towards the mission's frais total.
     */
    public const TYPE_UTILISATION_STOCK_EXISTANT = 'stock_existant';

    /**
     * A catalogue product the agent had to buy new -- payant, counted in
     * the frais total at its real prix_paye (not the catalogue's generic
     * prix), and requires a proof-of-purchase photo.
     */
    public const TYPE_UTILISATION_RACHETE = 'rachete';

    protected $fillable = [
        'sejour_id',
        'agent_id',
        'statut',
        'frais_forfait',
        'vue',
    ];

    protected $casts = [
        'frais_forfait' => 'decimal:2',
        'vue' => 'boolean',
    ];

    public function sejour(): BelongsTo
    {
        return $this->belongsTo(Sejour::class);
    }

    public function agent(): BelongsTo
    {
        return $this->belongsTo(Utilisateur::class, 'agent_id');
    }

    public function produits(): BelongsToMany
    {
        return $this->belongsToMany(
            ProduitMenageCatalogue::class,
            'mission_menage_produits',
            'mission_menage_id',
            'produit_catalogue_id',
        )->withPivot(['type_utilisation', 'photo_url', 'prix_paye']);
    }

    /**
     * The frais total contributed by this mission's catalogue products:
     * "stock_existant" products are free and never counted, only "rachete"
     * ones do, at their real prix_paye (never the catalogue's generic prix).
     */
    public function fraisProduitsTotal(): float
    {
        return (float) $this->produits
            ->filter(fn (ProduitMenageCatalogue $produit) => $produit->pivot->type_utilisation === self::TYPE_UTILISATION_RACHETE)
            ->sum(fn (ProduitMenageCatalogue $produit) => (float) $produit->pivot->prix_paye);
    }

    /**
     * This mission's catalogue products with their per-mission usage detail
     * (stock_existant vs rachete, and the rachete's proof photo/real price)
     * -- the flat shape used by every read-only historique-style endpoint.
     */
    public function produitsDetail(): Collection
    {
        return $this->produits->map(fn (ProduitMenageCatalogue $produit) => [
            'nom' => $produit->nom,
            'prix' => round((float) $produit->prix, 2),
            'photo_url' => $produit->photo_url,
            'type_utilisation' => $produit->pivot->type_utilisation,
            'photo_preuve_url' => $produit->pivot->photo_url,
            'prix_paye' => $produit->pivot->prix_paye !== null ? round((float) $produit->pivot->prix_paye, 2) : null,
        ])->values();
    }

    public function produitsSignales(): HasMany
    {
        return $this->hasMany(ProduitMenageSignale::class);
    }

    public function photosPreuve(): HasMany
    {
        return $this->hasMany(MissionMenagePhotoPreuve::class)->latest();
    }

    public function checklistItems(): HasMany
    {
        return $this->hasMany(ChecklistItem::class)->orderBy('ordre');
    }

    public function refus(): HasMany
    {
        return $this->hasMany(MissionMenageRefus::class)->latest();
    }
}
