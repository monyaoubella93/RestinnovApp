<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Utilisateur extends Authenticatable
{
    use HasApiTokens, HasFactory;

    public const ROLE_MANAGER = 'manager';

    public const ROLE_MENAGE = 'menage';

    public const ROLE_MAINTENANCE = 'maintenance';

    protected $fillable = [
        'nom',
        'role',
        'telephone',
        'adresse',
        'password',
        'actif',
    ];

    protected $hidden = [
        'password',
    ];

    protected $casts = [
        'actif' => 'boolean',
    ];

    public function missionMenages(): HasMany
    {
        return $this->hasMany(MissionMenage::class, 'agent_id');
    }

    public function appartementsHabituels(): HasMany
    {
        return $this->hasMany(Appartement::class, 'agent_habituel_id');
    }

    public function ticketsMaintenance(): HasMany
    {
        return $this->hasMany(TicketMaintenance::class, 'agent_id');
    }
}
