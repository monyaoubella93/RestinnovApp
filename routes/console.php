<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('sejours:activer-en-cours')->daily();
Schedule::command('maintenance:verifier-retards')->daily();

// Disabled per décision du DG (2026-08): an automatic 11:00 checkout is too
// risky -- a traveler running late or extending their stay would get their
// appartement wrongly flipped to "disponible" without anyone checking with
// them first. The Manager is now the sole decision-maker for checkout, via
// the manual "Confirmer le checkout" button. The command itself
// (sejours:checkout-automatique) is kept in the codebase, unused, in case
// this is revisited later -- do not delete it.
// Schedule::command('sejours:checkout-automatique')->dailyAt('11:00');
