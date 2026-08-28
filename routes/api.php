<?php

use App\Http\Controllers\AppartementController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ChecklistItemController;
use App\Http\Controllers\ChecklistModeleController;
use App\Http\Controllers\ChecklistModeleItemController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FraisMaintenanceController;
use App\Http\Controllers\MissionMenageController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ProduitCatalogueController;
use App\Http\Controllers\ProduitSignaleController;
use App\Http\Controllers\ProprietaireController;
use App\Http\Controllers\SejourController;
use App\Http\Controllers\TicketMaintenanceController;
use App\Http\Controllers\UtilisateurController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

    // Manager-only: séjours/appartements/agents/checklist templates/
    // dashboard/maintenance-cost management and the moderation side of the
    // produits catalogue.
    Route::middleware('role:manager')->group(function () {
        Route::get('/dashboard', [DashboardController::class, 'index']);
        Route::get('/notifications', [NotificationController::class, 'index']);

        Route::get('/appartements', [AppartementController::class, 'index']);
        Route::post('/appartements', [AppartementController::class, 'store']);
        Route::patch('/appartements/{appartement}', [AppartementController::class, 'update']);
        Route::get('/appartements/{appartement}/historique', [AppartementController::class, 'historique']);
        Route::get('/appartements/{appartement}/releve', [AppartementController::class, 'releve']);
        Route::get('/appartements/{appartement}/releve/pdf', [AppartementController::class, 'relevePdf']);

        Route::get('/proprietaires', [ProprietaireController::class, 'index']);
        Route::post('/proprietaires', [ProprietaireController::class, 'store']);

        Route::get('/checklist-modeles', [ChecklistModeleController::class, 'index']);
        Route::post('/checklist-modeles', [ChecklistModeleController::class, 'store']);
        Route::post('/checklist-modeles/{checklistModele}/items', [ChecklistModeleItemController::class, 'store']);
        Route::patch('/checklist-modele-items/{checklistModeleItem}/deplacer', [ChecklistModeleItemController::class, 'deplacer']);
        Route::delete('/checklist-modele-items/{checklistModeleItem}', [ChecklistModeleItemController::class, 'destroy']);

        Route::get('/utilisateurs', [UtilisateurController::class, 'index']);
        Route::post('/utilisateurs', [UtilisateurController::class, 'store']);
        Route::patch('/utilisateurs/{utilisateur}', [UtilisateurController::class, 'update']);
        Route::patch('/utilisateurs/{utilisateur}/desactiver', [UtilisateurController::class, 'desactiver']);
        Route::patch('/utilisateurs/{utilisateur}/reactiver', [UtilisateurController::class, 'reactiver']);
        Route::delete('/utilisateurs/{utilisateur}', [UtilisateurController::class, 'destroy']);

        Route::get('/sejours', [SejourController::class, 'index']);
        Route::get('/sejours/{sejour}', [SejourController::class, 'show']);
        Route::post('/sejours', [SejourController::class, 'store']);
        Route::patch('/sejours/{sejour}', [SejourController::class, 'update']);
        Route::patch('/sejours/{sejour}/checkout', [SejourController::class, 'checkout']);

        Route::post('/sejours/{sejour}/frais-maintenance', [FraisMaintenanceController::class, 'store']);
        Route::delete('/frais-maintenance/{fraisMaintenance}', [FraisMaintenanceController::class, 'destroy']);

        Route::post('/produits-catalogue', [ProduitCatalogueController::class, 'store']);

        Route::get('/produits-signales', [ProduitSignaleController::class, 'index']);
        Route::patch('/produits-signales/{produitSignale}/valider', [ProduitSignaleController::class, 'valider']);
        Route::patch('/produits-signales/{produitSignale}/rejeter', [ProduitSignaleController::class, 'rejeter']);

        Route::patch('/mission-menages/{missionMenage}/valider', [MissionMenageController::class, 'valider']);

        Route::get('/tickets-maintenance', [TicketMaintenanceController::class, 'index']);
        Route::patch('/tickets-maintenance/{ticketMaintenance}/assigner', [TicketMaintenanceController::class, 'assigner']);
        Route::patch('/tickets-maintenance/{ticketMaintenance}/valider-resolution', [TicketMaintenanceController::class, 'validerResolution']);
        Route::patch('/tickets-maintenance/{ticketMaintenance}/refuser-resolution', [TicketMaintenanceController::class, 'refuserResolution']);
    });

    // "menage" (and "manager") -- the cleaning mission workspace: checklist
    // execution and the frais-de-menage flow (forfait/produits/signalement).
    Route::middleware('role:menage,manager')->group(function () {
        Route::get('/produits-catalogue', [ProduitCatalogueController::class, 'index']);

        Route::get('/mission-menages', [MissionMenageController::class, 'index']);
        Route::get('/mes-missions/historique', [MissionMenageController::class, 'historique']);
        Route::get('/mission-menages/{missionMenage}', [MissionMenageController::class, 'show']);
        Route::patch('/mission-menages/{missionMenage}/produits', [MissionMenageController::class, 'updateProduits']);
        Route::patch('/mission-menages/{missionMenage}/vue', [MissionMenageController::class, 'marquerVue']);
        Route::patch('/mission-menages/{missionMenage}/ouvrir', [MissionMenageController::class, 'ouvrir']);
        Route::patch('/mission-menages/{missionMenage}/terminer', [MissionMenageController::class, 'terminer']);
        Route::post('/mission-menages/{missionMenage}/produits-signales', [MissionMenageController::class, 'signalerProduit']);
        Route::post('/mission-menages/{missionMenage}/signalements', [MissionMenageController::class, 'signalerProbleme']);

        Route::patch('/checklist-items/{checklistItem}', [ChecklistItemController::class, 'update']);
    });

    // "maintenance" (and "manager") -- the maintenance agent workspace: only
    // the agent's own assigned tickets, resolved with a photo proof + cost.
    Route::middleware('role:maintenance,manager')->group(function () {
        Route::get('/tickets-maintenance/mes-tickets', [TicketMaintenanceController::class, 'mesTickets']);
        Route::patch('/tickets-maintenance/{ticketMaintenance}/commencer', [TicketMaintenanceController::class, 'commencer']);
        Route::patch('/tickets-maintenance/{ticketMaintenance}/resoudre', [TicketMaintenanceController::class, 'resoudre']);
    });
});
