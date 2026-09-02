<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Inserts "en_cours" into the statut cycle, between "assigne" and
     * "resolu_en_attente_validation" -- set by the agent themselves via
     * commencer(), not the Manager. Mirrors the same
     * enum(...)->change() pattern already used to grow this column
     * (see 2026_08_16_090000_add_reference_and_refus_to_tickets_maintenance_table).
     */
    public function up(): void
    {
        Schema::table('tickets_maintenance', function (Blueprint $table) {
            $table->enum('statut', ['ouvert', 'assigne', 'en_cours', 'resolu_en_attente_validation', 'resolu', 'a_refaire'])
                ->default('ouvert')
                ->change();
        });
    }

    public function down(): void
    {
        Schema::table('tickets_maintenance', function (Blueprint $table) {
            $table->enum('statut', ['ouvert', 'assigne', 'resolu_en_attente_validation', 'resolu', 'a_refaire'])
                ->default('ouvert')
                ->change();
        });
    }
};
