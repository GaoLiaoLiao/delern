import 'package:delern_flutter/models/user.dart';
import 'package:delern_flutter/view_models/base/screen_bloc.dart';
import 'package:delern_flutter/views/helpers/auth_widget.dart';
import 'package:delern_flutter/views/helpers/localization.dart';
import 'package:delern_flutter/views/helpers/user_messages.dart';
import 'package:flutter/material.dart';

typedef BlocBuilder<T extends ScreenBloc> = T Function(User user);
typedef WidgetBuilderWithBloc<TBloc extends ScreenBloc, TWidget extends Widget>
    = TWidget Function(TBloc bloc);

class ScreenBlocView<T extends ScreenBloc> extends StatefulWidget {
  final WidgetBuilderWithBloc<T, PreferredSizeWidget> appBarBuilder;
  final WidgetBuilderWithBloc<T, Widget> bodyBuilder;
  final BlocBuilder<T> blocBuilder;
  final WidgetBuilderWithBloc<T, Widget> floatingActionButtonBuilder;
  final bool resizeToAvoidBottomInset;

  const ScreenBlocView({
    @required this.blocBuilder,
    @required this.appBarBuilder,
    @required this.bodyBuilder,
    this.floatingActionButtonBuilder,
    this.resizeToAvoidBottomInset = false,
  })  : assert(appBarBuilder != null),
        assert(bodyBuilder != null),
        assert(blocBuilder != null);

  @override
  _ScreenBlocViewState<T> createState() => _ScreenBlocViewState<T>();
}

class _ScreenBlocViewState<T extends ScreenBloc>
    extends State<ScreenBlocView<T>> {
  T _bloc;

  final _scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void didChangeDependencies() {
    final user = CurrentUserWidget.of(context).user;
    if (user.uid != _bloc?.user?.uid) {
      _bloc?.dispose();
      _bloc = widget.blocBuilder(user);
      _bloc.doPop.listen((_) => Navigator.pop(_scaffoldKey.currentContext));
      _bloc.doShowError.listen(_showUserMessage);
      _bloc.doShowMessage.listen(_showUserMessage);
    }

    final locale = context.l;
    if (_bloc.locale != locale) {
      _bloc.onLocale.add(locale);
    }

    super.didChangeDependencies();
  }

  @override
  Widget build(BuildContext context) => WillPopScope(
      onWillPop: () async {
        // Bloc decides what happens when user requested to leave screen
        _bloc.onCloseScreen.add(null);
        return false;
      },
      child: Scaffold(
        key: _scaffoldKey,
        appBar: widget.appBarBuilder(_bloc),
        body: widget.bodyBuilder(_bloc),
        floatingActionButton: widget.floatingActionButtonBuilder == null
            ? null
            : widget.floatingActionButtonBuilder(_bloc),
        resizeToAvoidBottomInset: widget.resizeToAvoidBottomInset,
      ));

  void _showUserMessage(String message) {
    UserMessages.showMessage(_scaffoldKey.currentState, message);
  }

  @override
  void dispose() {
    super.dispose();
    _bloc.dispose();
  }
}
