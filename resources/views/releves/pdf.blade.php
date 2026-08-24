<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Relevé {{ $mois }} - {{ $appartement['nom'] }}</title>
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 12px; color: #1f2937; }
        .header { margin-bottom: 16px; }
        .header img { height: 48px; }
        h1 { font-size: 18px; margin-bottom: 0; }
        h2 { font-size: 13px; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
        .subtitle { color: #6b7280; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
        th { color: #6b7280; text-transform: uppercase; font-size: 10px; }
        .montant { text-align: right; }
        .totaux { margin-top: 16px; width: 50%; margin-left: auto; }
        .totaux td { border-bottom: none; padding: 3px 8px; }
        .totaux .label { color: #6b7280; }
        .total-final td { border-top: 2px solid #1f2937; font-weight: bold; padding-top: 8px; }
        .empty { color: #9ca3af; font-style: italic; }
    </style>
</head>
<body>
    <div class="header">
        <img src="data:image/png;base64,{{ base64_encode(file_get_contents(resource_path('images/logo.png'))) }}" alt="RestInnov">
    </div>
    <h1>Relevé propriétaire</h1>
    <p class="subtitle">
        {{ $appartement['proprietaire']['nom'] ?? 'Propriétaire non renseigné' }}
        — {{ $appartement['nom'] }} ({{ $appartement['adresse'] }})
        — {{ $mois }}
    </p>

    <h2>Séjours du mois</h2>
    @if (count($sejours) === 0)
        <p class="empty">Aucun séjour ce mois-ci.</p>
    @else
        <table>
            <thead>
                <tr>
                    <th>Voyageur</th>
                    <th>Arrivée</th>
                    <th>Départ</th>
                    <th class="montant">Montant</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($sejours as $sejour)
                    <tr>
                        <td>{{ $sejour['nom_voyageur'] }}</td>
                        <td>{{ $sejour['date_arrivee'] }}</td>
                        <td>{{ $sejour['date_depart'] }}</td>
                        <td class="montant">{{ number_format($sejour['montant_mad'], 2) }} MAD</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <h2>Frais de ménage</h2>
    @if (count($frais_menage_detail) === 0)
        <p class="empty">Aucun frais de ménage ce mois-ci.</p>
    @else
        <table>
            <thead>
                <tr>
                    <th>Séjour</th>
                    <th>Forfait</th>
                    <th>Produits</th>
                    <th class="montant">Total</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($frais_menage_detail as $ligne)
                    <tr>
                        <td>{{ $ligne['nom_voyageur'] }}</td>
                        <td>{{ number_format($ligne['forfait'], 2) }} MAD</td>
                        <td>
                            @if (count($ligne['produits']) === 0)
                                —
                            @else
                                @foreach ($ligne['produits'] as $produit)
                                    @if ($produit['type_utilisation'] === 'stock_existant')
                                        {{ $produit['nom'] }} (déjà présent){{ !$loop->last ? ', ' : '' }}
                                    @else
                                        {{ $produit['nom'] }} ({{ number_format($produit['prix_paye'], 2) }} MAD){{ !$loop->last ? ', ' : '' }}
                                    @endif
                                @endforeach
                            @endif
                        </td>
                        <td class="montant">
                            {{ number_format($ligne['forfait'] + collect($ligne['produits'])->where('type_utilisation', 'rachete')->sum('prix_paye'), 2) }} MAD
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <h2>Frais de maintenance</h2>
    @if (count($frais_maintenance_detail) === 0)
        <p class="empty">Aucun frais de maintenance ce mois-ci.</p>
    @else
        <table>
            <thead>
                <tr>
                    <th>Description</th>
                    <th class="montant">Montant</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($frais_maintenance_detail as $frais)
                    <tr>
                        <td>{{ $frais['description'] }}</td>
                        <td class="montant">{{ number_format($frais['prix'], 2) }} MAD</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <table class="totaux">
        <tr>
            <td class="label">Revenus bruts</td>
            <td class="montant">{{ number_format($revenus_bruts, 2) }} MAD</td>
        </tr>
        <tr>
            <td class="label">Frais de ménage</td>
            <td class="montant">- {{ number_format($frais_menage_total, 2) }} MAD</td>
        </tr>
        <tr>
            <td class="label">Frais de maintenance</td>
            <td class="montant">- {{ number_format($frais_maintenance_total, 2) }} MAD</td>
        </tr>
        <tr>
            <td class="label">Résultat net</td>
            <td class="montant">{{ number_format($resultat_net, 2) }} MAD</td>
        </tr>
        <tr class="total-final">
            <td>Montant versé au propriétaire</td>
            <td class="montant">{{ number_format($montant_proprietaire, 2) }} MAD</td>
        </tr>
    </table>
</body>
</html>
