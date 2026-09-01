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
        Schema::create('releve_verrouillages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('appartement_id')->constrained()->cascadeOnDelete();
            $table->string('mois', 7);
            $table->timestamps();

            $table->unique(['appartement_id', 'mois']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('releve_verrouillages');
    }
};
