<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChecklistItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'mission_menage_id',
        'libelle',
        'libelle_ar',
        'checklist_modele_nom',
        'coche',
        'photo_url',
        'photo_reference_url',
        'ordre',
    ];

    protected $casts = [
        'coche' => 'boolean',
    ];

    public function missionMenage(): BelongsTo
    {
        return $this->belongsTo(MissionMenage::class);
    }
}
