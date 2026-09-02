<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MissionMenagePhotoPreuve extends Model
{
    use HasFactory;

    /** Documents the apartment's state before the agent starts the mission. */
    public const TYPE_AVANT = 'avant';

    /** Documents the finished (or re-corrected) work -- the "preuve de travail". */
    public const TYPE_APRES = 'apres';

    protected $table = 'mission_menage_photos_preuve';

    protected $fillable = [
        'mission_menage_id',
        'photo_url',
        'note',
        'type',
    ];

    public function missionMenage(): BelongsTo
    {
        return $this->belongsTo(MissionMenage::class);
    }
}
