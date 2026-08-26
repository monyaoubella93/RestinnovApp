<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('charges_appartement', function (Blueprint $table) {
            $table->id();
            $table->foreignId('appartement_id')->constrained()->cascadeOnDelete();
            $table->string('mois');
            $table->string('description');
            $table->decimal('quantite', 8, 2)->default(1);
            $table->decimal('prix_unitaire', 10, 2);
            $table->timestamps();

            $table->index(['appartement_id', 'mois']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('charges_appartement');
    }
};
