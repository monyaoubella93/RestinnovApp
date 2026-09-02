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
        // Distinguishes the mandatory "avant ménage" photo (documents the
        // apartment's state before the agent starts, required to move a
        // mission a_faire -> en_cours, see
        // MissionMenageController::commencer()) from every "apres ménage"
        // photo attached through the existing "preuve de travail" mechanism
        // (required before "Marquer terminé", and reused as-is for
        // post-refus resubmissions). Nullable because it's meaningless for
        // rows created before this column existed.
        Schema::table('mission_menage_photos_preuve', function (Blueprint $table) {
            $table->string('type')->nullable()->after('mission_menage_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('mission_menage_photos_preuve', function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }
};
