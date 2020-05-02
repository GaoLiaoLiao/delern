import 'package:cached_network_image/cached_network_image.dart';
import 'package:delern_flutter/remote/error_reporting.dart' as error_reporting;
import 'package:delern_flutter/views/helpers/localization.dart';
import 'package:delern_flutter/views/helpers/progress_indicator_widget.dart';
import 'package:delern_flutter/views/helpers/styles.dart' as app_styles;
import 'package:flutter/material.dart';
import 'package:pedantic/pedantic.dart';

Widget buildDisplayImageWidget(String uri) => CachedNetworkImage(
      imageUrl: uri,
      placeholder: (context, url) =>
          const ImageProgressIndicatorPlaceholderWidget(),
      errorWidget: (context, url, error) {
        unawaited(error_reporting.report(
          error,
          description: 'Image loading failed: $url',
        ));
        return Column(
          children: <Widget>[
            Icon(
              Icons.error,
              color: app_styles.kIconColor,
            ),
            Text(
              context.l.imageLoadingErrorUserMessage,
              softWrap: true,
              textAlign: TextAlign.center,
              style: app_styles.secondaryText,
            ),
          ],
        );
      },
    );
