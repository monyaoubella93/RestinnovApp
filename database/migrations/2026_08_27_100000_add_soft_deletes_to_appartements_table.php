<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Soft delete for appartements: "Supprimer" from the Liste des
     * appartements screen never issues a real DELETE -- it only sets
     * deleted_at, so a mistaken deletion can be recovered from the
     * database and past séjours/tickets/relevés that still reference the
     * appartement keep a valid row to join against.
     */
    public function up(): void
    {
        Schema::table('appartements', function (Blueprint $table) {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('appartements', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
    }
};
