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
        Schema::table('sejours', function (Blueprint $table) {
            // The historical import's source row identifier (sejour_ref):
            // lets the import command detect "already imported" on a
            // re-run without guessing from dates/appartement alone.
            $table->string('sejour_ref_externe')->nullable()->unique()->after('reference');
            $table->text('notes')->nullable()->after('plateforme_origine');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sejours', function (Blueprint $table) {
            $table->dropUnique(['sejour_ref_externe']);
            $table->dropColumn(['sejour_ref_externe', 'notes']);
        });
    }
};
