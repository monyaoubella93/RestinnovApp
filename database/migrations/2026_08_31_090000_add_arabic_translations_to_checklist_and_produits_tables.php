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
        // The Manager now enters both a French and an optional Arabic label
        // for every checklist task -- libelle stays the French version
        // (unchanged, still required), libelle_ar is shown to the agent
        // instead only when the agent's chosen interface language is Arabic
        // and this field is filled in for that specific task.
        Schema::table('checklist_modele_items', function (Blueprint $table) {
            $table->string('libelle_ar')->nullable()->after('libelle');
        });

        // Snapshot copy, mirroring how libelle/photo_url are already copied
        // from checklist_modele_items onto each generated mission's items
        // (see SejourCheckoutService).
        Schema::table('checklist_items', function (Blueprint $table) {
            $table->string('libelle_ar')->nullable()->after('libelle');
        });

        // Same optional Arabic name + fallback logic for catalogue products.
        Schema::table('produits_menage_catalogue', function (Blueprint $table) {
            $table->string('nom_ar')->nullable()->after('nom');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('produits_menage_catalogue', function (Blueprint $table) {
            $table->dropColumn('nom_ar');
        });

        Schema::table('checklist_items', function (Blueprint $table) {
            $table->dropColumn('libelle_ar');
        });

        Schema::table('checklist_modele_items', function (Blueprint $table) {
            $table->dropColumn('libelle_ar');
        });
    }
};
