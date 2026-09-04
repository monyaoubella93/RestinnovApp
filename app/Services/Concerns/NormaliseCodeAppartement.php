<?php

namespace App\Services\Concerns;

trait NormaliseCodeAppartement
{
    /**
     * Case/whitespace-insensitive comparison key for an appartement's
     * external code -- e.g. "Adrar 2" and "Adrar2" both normalise to
     * "ADRAR2", so the various historical CSV exports (which don't always
     * agree on spacing/casing) still match the same appartement. Shared by
     * every historical import service so they never drift apart.
     */
    private function normaliserCode(string $code): string
    {
        return preg_replace('/\s+/', '', strtoupper(trim($code)));
    }
}
