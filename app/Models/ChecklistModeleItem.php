<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChecklistModeleItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'checklist_modele_id',
        'libelle',
        'libelle_ar',
        'photo_url',
        'ordre',
    ];

    public function checklistModele(): BelongsTo
    {
        return $this->belongsTo(ChecklistModele::class);
    }
}
