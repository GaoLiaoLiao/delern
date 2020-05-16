import 'package:built_collection/built_collection.dart';
import 'package:delern_flutter/views/helpers/card_side_widget.dart';
import 'package:delern_flutter/views/helpers/tags_widget.dart';
import 'package:flutter/material.dart';

class CardDisplayWidget extends StatelessWidget {
  final String front;
  final BuiltList<String> frontImages;
  final String back;
  final List<String> tags;
  final BuiltList<String> backImages;
  final bool showBack;
  final Color color;

  const CardDisplayWidget({
    @required this.front,
    @required this.frontImages,
    @required this.back,
    @required this.backImages,
    @required this.tags,
    @required this.showBack,
    @required this.color,
  });

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(8),
        child: Card(
          color: color,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: _buildCardBody(context),
          ),
        ),
      );

  List<Widget> _buildCardBody(BuildContext context) {
    final widgetList = <Widget>[
      TagsWidget(tags: BuiltSet<String>.of(tags)),
      CardSideWidget(text: front, imagesList: frontImages),
    ];

    if (showBack) {
      widgetList
        ..add(const Padding(
          padding: EdgeInsets.symmetric(vertical: 15),
          child: Divider(height: 1),
        ))
        ..add(CardSideWidget(text: back, imagesList: backImages));
    }

    return widgetList;
  }
}
