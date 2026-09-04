<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Real monthly totals per appartement, extracted from the pre-app
        // era ("Summaries" sheet of the DG's Excel) -- a different level
        // from the individually-imported historical séjours (see
        // HistoriqueImportService), which never carried a montant_mad and
        // so can no longer be aggregated into an accurate CA. One row per
        // (appartement, mois): ReleveService::calculer() overrides its
        // live, séjour-based computation with these figures whenever a row
        // exists for the requested month.
        Schema::create('releves_mensuels_historiques', function (Blueprint $table) {
            $table->id();
            $table->foreignId('appartement_id')->constrained('appartements')->cascadeOnDelete();
            $table->string('mois'); // 'Y-m', e.g. "2025-01"
            $table->decimal('ca', 10, 2);
            $table->decimal('charges', 10, 2);
            $table->decimal('revenu_proprietaire', 10, 2);
            $table->decimal('notre_commission', 10, 2);
            $table->timestamps();

            $table->unique(['appartement_id', 'mois']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('releves_mensuels_historiques');
    }
};
