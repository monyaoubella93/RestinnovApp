<?php

namespace App\Http\Controllers;

use App\Models\Proprietaire;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProprietaireController extends Controller
{
    /**
     * Display a listing of proprietaires, for the appartement form's
     * "select an existing owner" dropdown.
     */
    public function index(): JsonResponse
    {
        return response()->json(Proprietaire::orderBy('nom')->get());
    }

    /**
     * Quick-create a proprietaire from the appartement form, mirroring the
     * checklist modele's "+ Créer un nouveau modèle" pattern.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nom' => ['required', 'string', 'max:255'],
            'telephone' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'adresse' => ['nullable', 'string', 'max:255'],
        ]);

        $proprietaire = Proprietaire::create($validated);

        return response()->json($proprietaire, 201);
    }

    /**
     * Update an existing proprietaire's contact details -- e.g. filling in
     * a phone/email/adresse that was left blank at quick-creation time, or
     * correcting them ahead of generating a relevé/facture.
     */
    public function update(Request $request, Proprietaire $proprietaire): JsonResponse
    {
        $validated = $request->validate([
            'nom' => ['required', 'string', 'max:255'],
            'telephone' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'adresse' => ['nullable', 'string', 'max:255'],
        ]);

        $proprietaire->update($validated);

        return response()->json($proprietaire->fresh());
    }
}
