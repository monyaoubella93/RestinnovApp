<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Voyageur extends Model
{
    use HasFactory;

    public const TYPE_ADULTE = 'adulte';
    public const TYPE_ENFANT = 'enfant';

    protected $fillable = [
        'sejour_id',
        'nom',
        'date_naissance',
        'nationalite',
        'numero_passeport',
        'telephone',
        'est_principal',
        'type',
    ];

    protected $casts = [
        'est_principal' => 'boolean',
        'date_naissance' => 'date:Y-m-d',
    ];

    public function sejour(): BelongsTo
    {
        return $this->belongsTo(Sejour::class);
    }
}
