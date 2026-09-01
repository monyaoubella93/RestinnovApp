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
        Schema::table('mission_menage_produits', function (Blueprint $table) {
            $table->enum('type_utilisation', ['stock_existant', 'rachete'])
                ->default('rachete')
                ->after('produit_catalogue_id');
            $table->string('photo_url')->nullable()->after('type_utilisation');
            $table->decimal('prix_paye', 10, 2)->nullable()->after('photo_url');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('mission_menage_produits', function (Blueprint $table) {
            $table->dropColumn(['type_utilisation', 'photo_url', 'prix_paye']);
        });
    }
};
