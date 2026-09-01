<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Sejour extends Model
{
    use HasFactory;

    public const STATUT_A_VENIR = 'a_venir';
    public const STATUT_EN_COURS = 'en_cours';
    public const STATUT_TERMINE = 'termine';
    public const STATUT_ANNULE = 'annule';

    public const PLATEFORME_AIRBNB = 'airbnb';
    public const PLATEFORME_DIRECT = 'direct';
    public const PLATEFORME_AUTRE = 'autre';
    public const PLATEFORME_BOOKING = 'booking';

    protected $fillable = [
        'appartement_id',
        'date_arrivee',
        'date_depart',
        'nom_voyageur',
        'statut',
        'plateforme_origine',
        'montant_mad',
    ];

    protected $casts = [
        'date_arrivee' => 'date:Y-m-d',
        'date_depart' => 'date:Y-m-d',
        'montant_mad' => 'decimal:2',
    ];

    protected static function booted(): void
    {
        static::creating(function (Sejour $sejour) {
            if (empty($sejour->reference)) {
                $sejour->reference = static::nextReference();
            }
        });
    }

    /**
     * Next short reference in the SEJ-0001, SEJ-0002... sequence. Derived
     * from the last-created sejour's own reference rather than a dedicated
     * counter table -- simple increment, not meant to be collision-proof
     * under heavy concurrency, which this app's volume doesn't need.
     */
    public static function nextReference(): string
    {
        $last = static::query()->whereNotNull('reference')->orderByDesc('id')->value('reference');

        $lastNumber = 0;
        if ($last && preg_match('/(\d+)$/', $last, $matches)) {
            $lastNumber = (int) $matches[1];
        }

        return sprintf('SEJ-%04d', $lastNumber + 1);
    }

    public function appartement(): BelongsTo
    {
        return $this->belongsTo(Appartement::class);
    }

    public function missionMenage(): HasOne
    {
        return $this->hasOne(MissionMenage::class);
    }

    public function voyageurs(): HasMany
    {
        return $this->hasMany(Voyageur::class);
    }

    public function fraisMaintenance(): HasMany
    {
        return $this->hasMany(FraisMaintenance::class);
    }
}
