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
        Schema::table('produits_menage_signales', function (Blueprint $table) {
            $table->decimal('prix', 10, 2)->nullable()->after('note');
            $table->string('photo_ticket_url')->nullable()->after('prix');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('produits_menage_signales', function (Blueprint $table) {
            $table->dropColumn(['prix', 'photo_ticket_url']);
        });
    }
};
